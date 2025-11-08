"""
κζ Spatial Field Computation Layer

This module extends ZetaTranslator to compute spatial κζ(x,t) fields and
implements bidirectional coupling between geometry and particle dynamics.

Key Components:
- KappaZetaField2D/3D: Spatial discretization of κζ field on grid
- Bidirectional update mechanism:
  * Forward: κζ field → forces on particles
  * Backward: particle configuration → update κζ field
- Oscillation tracking for emergent electrostatic field generation
- Integration with ZetaTranslator for ζ-compatible curvature

Mathematical Framework:
    Global κζ: Computed from eigenvalues via ZetaTranslator
    Local κζ(x): Spatially-varying field from particle density
    Temporal κζ(x,t): Time-dependent for oscillation detection

    Moments from local density:
        M_τ(x) = Σⱼ K(x-xⱼ) cos²(θⱼ)
        M_σ(x) = Σⱼ K(x-xⱼ) sin²(θⱼ)
        κζ(x) = M_τ(x) / M_σ(x)

Author: Enhanced for Noetic Eidos Project
License: MIT
"""

import torch
import numpy as np
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass, field
from zeta_translator import ZetaTranslator


@dataclass
class SpatialGrid:
    """
    Spatial grid for field computation.

    Attributes:
        bounds: ((x_min, x_max), (y_min, y_max)) or ((x_min, x_max), (y_min, y_max), (z_min, z_max))
        resolution: Number of grid points per dimension
        n_dim: Spatial dimensions (2 or 3)
        grid_points: (n_points, n_dim) flattened grid coordinates
        grid_shape: Shape of unflattened grid
    """
    bounds: Tuple[Tuple[float, float], ...]
    resolution: int
    n_dim: int = 2
    grid_points: Optional[torch.Tensor] = None
    grid_shape: Optional[Tuple[int, ...]] = None

    def __post_init__(self):
        """Initialize grid points."""
        if len(self.bounds) != self.n_dim:
            raise ValueError(f"bounds length {len(self.bounds)} != n_dim {self.n_dim}")

        # Create meshgrid
        axes = []
        for dim in range(self.n_dim):
            x_min, x_max = self.bounds[dim]
            axes.append(torch.linspace(x_min, x_max, self.resolution))

        # Meshgrid: returns tensors of shape (resolution, resolution, ...)
        grids = torch.meshgrid(*axes, indexing='ij')

        # Flatten and stack: (n_points, n_dim)
        self.grid_points = torch.stack([g.flatten() for g in grids], dim=1)
        self.grid_shape = tuple(self.resolution for _ in range(self.n_dim))

    def unflatten_field(self, field_values: torch.Tensor) -> torch.Tensor:
        """
        Reshape flattened field values back to grid shape.

        Args:
            field_values: (n_points,) or (n_points, n_channels) flattened field

        Returns:
            (*grid_shape,) or (*grid_shape, n_channels) reshaped field
        """
        if field_values.ndim == 1:
            return field_values.reshape(self.grid_shape)
        else:
            return field_values.reshape(*self.grid_shape, -1)


class KappaZetaField:
    """
    Spatial κζ field with bidirectional particle coupling.

    This class maintains a spatial discretization of the κζ field and handles:
    1. Computing κζ(x) from local particle density
    2. Updating particle forces based on κζ field
    3. Tracking temporal evolution for oscillation detection
    """

    def __init__(
        self,
        grid: SpatialGrid,
        zeta_translator: Optional[ZetaTranslator] = None,
        bandwidth: float = 0.5,
        temporal_alpha: float = 0.1
    ):
        """
        Initialize spatial κζ field.

        Args:
            grid: Spatial grid configuration
            zeta_translator: ZetaTranslator for ζ-compatible computation (optional)
            bandwidth: Kernel bandwidth for density estimation
            temporal_alpha: EMA parameter for temporal smoothing
        """
        self.grid = grid
        self.zeta = zeta_translator or ZetaTranslator(s=0.5)
        self.bandwidth = bandwidth
        self.alpha = temporal_alpha

        # Current field values
        self.kappa_field = torch.zeros(grid.grid_points.shape[0])  # M_τ / M_σ
        self.M_tau_field = torch.zeros(grid.grid_points.shape[0])
        self.M_sigma_field = torch.zeros(grid.grid_points.shape[0])

        # Temporal tracking
        self.field_history: List[Tuple[float, torch.Tensor]] = []
        self.kappa_smooth = None  # EMA-smoothed κζ field

    def compute_kernel_density(
        self,
        particle_positions: torch.Tensor,
        particle_weights: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Compute kernel density estimation at grid points.

        Args:
            particle_positions: (n_particles, n_dim) particle locations
            particle_weights: (n_particles,) particle weights (default: uniform)

        Returns:
            (n_grid_points, n_particles) kernel weight matrix
        """
        if particle_weights is None:
            particle_weights = torch.ones(particle_positions.shape[0])

        # Distance from grid points to particles
        # (n_grid, 1, n_dim) - (1, n_particles, n_dim) -> (n_grid, n_particles, n_dim)
        dx = self.grid.grid_points[:, None, :] - particle_positions[None, :, :]
        dist_sq = (dx ** 2).sum(dim=2)  # (n_grid, n_particles)

        # Gaussian kernel: K(x) = exp(-||x||²/2h²)
        kernel = torch.exp(-dist_sq / (2 * self.bandwidth ** 2))

        # Weight by particle masses/weights
        kernel_weighted = kernel * particle_weights[None, :]

        # Normalize per grid point
        kernel_norm = kernel_weighted.sum(dim=1, keepdim=True) + 1e-12
        kernel_normalized = kernel_weighted / kernel_norm

        return kernel_normalized

    def compute_field_from_particles(
        self,
        particle_positions: torch.Tensor,
        foci_angles: torch.Tensor,
        foci_centers: torch.Tensor,
        particle_weights: Optional[torch.Tensor] = None,
        global_M_tau: float = 0.5,
        global_M_sigma: float = 0.5
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Compute spatial κζ field from particle configuration.

        For each particle, assign angle based on nearest focus, then compute
        local moments via kernel density estimation.

        Args:
            particle_positions: (n_particles, n_dim) particle locations
            foci_angles: (n_foci,) focal angles in radians
            foci_centers: (n_foci, n_dim) focal positions
            particle_weights: (n_particles,) particle weights (optional)
            global_M_tau: Global tau moment (for blending)
            global_M_sigma: Global sigma moment (for blending)

        Returns:
            kappa_field: (n_grid_points,) local κζ values
            M_tau_field: (n_grid_points,) local M_τ values
            M_sigma_field: (n_grid_points,) local M_σ values
        """
        n_particles = particle_positions.shape[0]

        if n_particles == 0:
            # No particles: return global values
            kappa_global = global_M_tau / (global_M_sigma + 1e-12)
            return (
                torch.full_like(self.kappa_field, kappa_global),
                torch.full_like(self.M_tau_field, global_M_tau),
                torch.full_like(self.M_sigma_field, global_M_sigma)
            )

        # Find nearest focus for each particle
        # (n_particles, 1, n_dim) - (1, n_foci, n_dim) -> (n_particles, n_foci)
        dx_to_foci = particle_positions[:, None, :] - foci_centers[None, :, :]
        dist_to_foci = (dx_to_foci ** 2).sum(dim=2)
        nearest_focus_idx = dist_to_foci.argmin(dim=1)  # (n_particles,)

        # Get angles of nearest foci
        particle_angles = foci_angles[nearest_focus_idx]  # (n_particles,)

        # Compute cos² and sin² for each particle
        cos2_particles = torch.cos(particle_angles) ** 2
        sin2_particles = torch.sin(particle_angles) ** 2

        # Kernel density at grid points
        kernel = self.compute_kernel_density(particle_positions, particle_weights)
        # kernel shape: (n_grid, n_particles)

        # Compute local moments at each grid point
        M_tau_local = (kernel * cos2_particles[None, :]).sum(dim=1)
        M_sigma_local = (kernel * sin2_particles[None, :]).sum(dim=1)

        # Blend with global values (80% local, 20% global)
        blend_factor = 0.8
        M_tau_field = blend_factor * M_tau_local + (1 - blend_factor) * global_M_tau
        M_sigma_field = blend_factor * M_sigma_local + (1 - blend_factor) * global_M_sigma

        # Compute κζ field
        kappa_field = M_tau_field / (M_sigma_field + 1e-12)

        return kappa_field, M_tau_field, M_sigma_field

    def update_from_particles(
        self,
        particle_positions: torch.Tensor,
        foci_angles: torch.Tensor,
        foci_centers: torch.Tensor,
        particle_weights: Optional[torch.Tensor] = None,
        global_M_tau: float = 0.5,
        global_M_sigma: float = 0.5,
        time: float = 0.0
    ):
        """
        Update field from current particle configuration (backward pass).

        Args:
            particle_positions: (n_particles, n_dim) particle locations
            foci_angles: (n_foci,) focal angles
            foci_centers: (n_foci, n_dim) focal positions
            particle_weights: (n_particles,) optional weights
            global_M_tau: Global tau moment
            global_M_sigma: Global sigma moment
            time: Current simulation time
        """
        # Compute new field
        kappa_new, M_tau_new, M_sigma_new = self.compute_field_from_particles(
            particle_positions,
            foci_angles,
            foci_centers,
            particle_weights,
            global_M_tau,
            global_M_sigma
        )

        # Temporal smoothing via EMA
        if self.kappa_smooth is None:
            self.kappa_smooth = kappa_new
        else:
            self.kappa_smooth = (1 - self.alpha) * self.kappa_smooth + self.alpha * kappa_new

        # Update stored fields
        self.kappa_field = self.kappa_smooth
        self.M_tau_field = M_tau_new
        self.M_sigma_field = M_sigma_new

        # Add to history
        self.field_history.append((time, self.kappa_field.clone()))

        # Keep history manageable
        if len(self.field_history) > 100:
            self.field_history.pop(0)

    def interpolate_to_positions(
        self,
        query_positions: torch.Tensor,
        field_values: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Interpolate field values to arbitrary query positions.

        Uses inverse distance weighting from nearest grid points.

        Args:
            query_positions: (n_query, n_dim) positions to query
            field_values: (n_grid_points,) field to interpolate (default: kappa_field)

        Returns:
            (n_query,) interpolated field values
        """
        if field_values is None:
            field_values = self.kappa_field

        # Distance from query points to grid points
        # (n_query, 1, n_dim) - (1, n_grid, n_dim) -> (n_query, n_grid)
        dx = query_positions[:, None, :] - self.grid.grid_points[None, :, :]
        distances = torch.sqrt((dx ** 2).sum(dim=2) + 1e-12)

        # Inverse distance weighting (use k nearest neighbors for efficiency)
        k = min(8, self.grid.grid_points.shape[0])
        top_k_dists, top_k_indices = torch.topk(distances, k, dim=1, largest=False)

        # Weights: w_i = 1/d_i² (IDW power=2)
        weights = 1.0 / (top_k_dists ** 2 + 1e-6)
        weights = weights / weights.sum(dim=1, keepdim=True)

        # Gather field values at k nearest points
        field_at_neighbors = field_values[top_k_indices]  # (n_query, k)

        # Weighted sum
        interpolated = (weights * field_at_neighbors).sum(dim=1)

        return interpolated

    def get_field_at_positions(
        self,
        positions: torch.Tensor,
        return_components: bool = False
    ) -> Tuple[torch.Tensor, ...]:
        """
        Get κζ field values at particle positions (forward pass).

        Args:
            positions: (n_particles, n_dim) query positions
            return_components: If True, return (kappa, M_tau, M_sigma)

        Returns:
            If return_components=False: (n_particles,) kappa values
            If return_components=True: (kappa, M_tau, M_sigma) tuples
        """
        kappa_at_pos = self.interpolate_to_positions(positions, self.kappa_field)

        if not return_components:
            return kappa_at_pos

        M_tau_at_pos = self.interpolate_to_positions(positions, self.M_tau_field)
        M_sigma_at_pos = self.interpolate_to_positions(positions, self.M_sigma_field)

        return kappa_at_pos, M_tau_at_pos, M_sigma_at_pos

    def compute_temporal_derivative(
        self,
        positions: torch.Tensor,
        order: int = 1
    ) -> torch.Tensor:
        """
        Compute temporal derivative ∂^n κζ/∂t^n at positions.

        Uses finite differences on field history.

        Args:
            positions: (n_particles, n_dim) query positions
            order: Derivative order (1 or 2)

        Returns:
            (n_particles,) temporal derivative values
        """
        if len(self.field_history) < order + 1:
            # Not enough history
            return torch.zeros(positions.shape[0])

        # Get recent field snapshots at positions
        recent_fields = []
        recent_times = []

        for t, field_snapshot in self.field_history[-(order+2):]:
            # Interpolate historical field to current positions
            field_at_pos = self.interpolate_to_positions(positions, field_snapshot)
            recent_fields.append(field_at_pos)
            recent_times.append(t)

        # Finite differences
        if order == 1:
            # ∂κζ/∂t ≈ (κζ(t) - κζ(t-1)) / Δt
            dt = recent_times[-1] - recent_times[-2] + 1e-12
            dkappa_dt = (recent_fields[-1] - recent_fields[-2]) / dt
            return dkappa_dt

        elif order == 2:
            # ∂²κζ/∂t² ≈ (κζ(t) - 2·κζ(t-1) + κζ(t-2)) / Δt²
            dt = recent_times[-1] - recent_times[-2] + 1e-12
            d2kappa_dt2 = (recent_fields[-1] - 2*recent_fields[-2] + recent_fields[-3]) / (dt ** 2)
            return d2kappa_dt2

        else:
            raise ValueError(f"Derivative order {order} not supported (use 1 or 2)")

    def compute_oscillation_metric(
        self,
        positions: torch.Tensor,
        window: int = 5
    ) -> torch.Tensor:
        """
        Compute oscillation strength from temporal variance.

        Args:
            positions: (n_particles, n_dim) query positions
            window: Number of time steps to analyze

        Returns:
            (n_particles,) oscillation amplitude
        """
        if len(self.field_history) < window:
            return torch.zeros(positions.shape[0])

        # Extract recent field values at positions
        recent_vals = []
        for _, field_snapshot in self.field_history[-window:]:
            vals_at_pos = self.interpolate_to_positions(positions, field_snapshot)
            recent_vals.append(vals_at_pos)

        # Stack: (window, n_particles)
        vals_tensor = torch.stack(recent_vals, dim=0)

        # Temporal variance (oscillation amplitude proxy)
        oscillation_strength = vals_tensor.var(dim=0)

        return oscillation_strength

    def get_statistics(self) -> Dict[str, float]:
        """
        Get field statistics for monitoring.

        Returns:
            dict with mean, std, min, max for κζ field
        """
        return {
            'kappa_mean': self.kappa_field.mean().item(),
            'kappa_std': self.kappa_field.std().item(),
            'kappa_min': self.kappa_field.min().item(),
            'kappa_max': self.kappa_field.max().item(),
            'M_tau_mean': self.M_tau_field.mean().item(),
            'M_sigma_mean': self.M_sigma_field.mean().item(),
            'history_length': len(self.field_history)
        }


class BidirectionalCoupler:
    """
    Orchestrates bidirectional coupling between κζ field and particles.

    Forward pass: κζ field → forces on particles
    Backward pass: particle configuration → update κζ field
    """

    def __init__(self, kappa_zeta_field: KappaZetaField):
        """
        Initialize bidirectional coupler.

        Args:
            kappa_zeta_field: Spatial κζ field instance
        """
        self.field = kappa_zeta_field

    def forward_pass(
        self,
        particle_positions: torch.Tensor,
        return_components: bool = False
    ) -> Tuple[torch.Tensor, ...]:
        """
        Forward pass: Get κζ field at particle positions.

        Args:
            particle_positions: (n_particles, n_dim) positions
            return_components: If True, return (kappa, M_tau, M_sigma)

        Returns:
            Field values at particle positions
        """
        return self.field.get_field_at_positions(particle_positions, return_components)

    def backward_pass(
        self,
        particle_positions: torch.Tensor,
        foci_angles: torch.Tensor,
        foci_centers: torch.Tensor,
        particle_weights: Optional[torch.Tensor] = None,
        global_M_tau: float = 0.5,
        global_M_sigma: float = 0.5,
        time: float = 0.0
    ):
        """
        Backward pass: Update field from particle configuration.

        Args:
            particle_positions: (n_particles, n_dim) positions
            foci_angles: (n_foci,) focal angles
            foci_centers: (n_foci, n_dim) focal positions
            particle_weights: (n_particles,) optional weights
            global_M_tau: Global tau moment
            global_M_sigma: Global sigma moment
            time: Current time
        """
        self.field.update_from_particles(
            particle_positions,
            foci_angles,
            foci_centers,
            particle_weights,
            global_M_tau,
            global_M_sigma,
            time
        )

    def coupled_step(
        self,
        particle_positions: torch.Tensor,
        foci_angles: torch.Tensor,
        foci_centers: torch.Tensor,
        particle_weights: Optional[torch.Tensor] = None,
        global_M_tau: float = 0.5,
        global_M_sigma: float = 0.5,
        time: float = 0.0
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Full coupled step: backward → forward.

        1. Update field from particles (backward)
        2. Get field at particle positions (forward)

        Args:
            particle_positions: (n_particles, n_dim) positions
            foci_angles: (n_foci,) focal angles
            foci_centers: (n_foci, n_dim) focal positions
            particle_weights: (n_particles,) optional weights
            global_M_tau: Global tau moment
            global_M_sigma: Global sigma moment
            time: Current time

        Returns:
            kappa_at_particles: (n_particles,) κζ values
            M_tau_at_particles: (n_particles,) M_τ values
            M_sigma_at_particles: (n_particles,) M_σ values
        """
        # Backward: update field
        self.backward_pass(
            particle_positions,
            foci_angles,
            foci_centers,
            particle_weights,
            global_M_tau,
            global_M_sigma,
            time
        )

        # Forward: get field at positions
        kappa, M_tau, M_sigma = self.forward_pass(particle_positions, return_components=True)

        return kappa, M_tau, M_sigma


if __name__ == "__main__":
    print("="*80)
    print("κζ Spatial Field Module - Test Suite")
    print("="*80)

    # Test 1: Create spatial grid
    print("\n[Test 1] Creating spatial grid:")
    print("-"*80)

    grid = SpatialGrid(
        bounds=((-5.0, 5.0), (-5.0, 5.0)),
        resolution=32,
        n_dim=2
    )

    print(f"Grid: {grid.resolution}×{grid.resolution} = {grid.grid_points.shape[0]} points")
    print(f"Bounds: {grid.bounds}")
    print(f"Grid shape: {grid.grid_shape}")

    # Test 2: Create κζ field
    print("\n[Test 2] Creating κζ field:")
    print("-"*80)

    kz_field = KappaZetaField(
        grid=grid,
        zeta_translator=ZetaTranslator(s=0.5),
        bandwidth=0.8
    )

    print(f"Field initialized with {kz_field.grid.grid_points.shape[0]} grid points")
    print(f"Bandwidth: {kz_field.bandwidth}")

    # Test 3: Compute field from particles
    print("\n[Test 3] Computing field from particles:")
    print("-"*80)

    # Create some particles
    n_particles = 20
    particle_pos = torch.randn(n_particles, 2) * 2.0

    # Foci configuration
    from polylipse_dataset import solve_focal_config
    n_foci = 3
    kappa_target = 1.5
    foci_angles, foci_weights = solve_focal_config(n_foci, kappa_target)
    foci_centers = 2.0 * torch.stack([torch.cos(foci_angles), torch.sin(foci_angles)], dim=1)

    # Compute M_tau and M_sigma
    M_tau = (foci_weights * torch.cos(foci_angles)**2).sum().item()
    M_sigma = (foci_weights * torch.sin(foci_angles)**2).sum().item()

    print(f"Particles: {n_particles}")
    print(f"Foci: {n_foci} (κζ target = {kappa_target:.2f})")
    print(f"Global moments: M_τ={M_tau:.4f}, M_σ={M_sigma:.4f}")

    # Update field
    kz_field.update_from_particles(
        particle_pos,
        foci_angles,
        foci_centers,
        global_M_tau=M_tau,
        global_M_sigma=M_sigma,
        time=0.0
    )

    stats = kz_field.get_statistics()
    print(f"Field statistics:")
    print(f"  κζ: mean={stats['kappa_mean']:.4f}, std={stats['kappa_std']:.4f}")
    print(f"  κζ range: [{stats['kappa_min']:.4f}, {stats['kappa_max']:.4f}]")

    # Test 4: Interpolation
    print("\n[Test 4] Testing field interpolation:")
    print("-"*80)

    query_pos = torch.tensor([[0.0, 0.0], [1.0, 1.0], [-2.0, 2.0]])
    kappa_at_query = kz_field.get_field_at_positions(query_pos)

    for i, pos in enumerate(query_pos):
        print(f"  Position {pos.numpy()}: κζ = {kappa_at_query[i]:.4f}")

    # Test 5: Bidirectional coupling
    print("\n[Test 5] Testing bidirectional coupling:")
    print("-"*80)

    coupler = BidirectionalCoupler(kz_field)

    # Coupled step
    kappa, M_tau_vals, M_sigma_vals = coupler.coupled_step(
        particle_pos,
        foci_angles,
        foci_centers,
        global_M_tau=M_tau,
        global_M_sigma=M_sigma,
        time=0.1
    )

    print(f"Coupled step completed")
    print(f"  κζ at particles: mean={kappa.mean():.4f}, std={kappa.std():.4f}")
    print(f"  M_τ at particles: mean={M_tau_vals.mean():.4f}")
    print(f"  M_σ at particles: mean={M_sigma_vals.mean():.4f}")

    # Test 6: Temporal tracking
    print("\n[Test 6] Testing temporal tracking:")
    print("-"*80)

    # Simulate time evolution
    for t in range(5):
        # Perturb particles slightly
        particle_pos = particle_pos + 0.1 * torch.randn_like(particle_pos)

        kappa, _, _ = coupler.coupled_step(
            particle_pos,
            foci_angles,
            foci_centers,
            global_M_tau=M_tau,
            global_M_sigma=M_sigma,
            time=t * 0.1
        )

    print(f"History length: {len(kz_field.field_history)}")

    # Compute temporal derivative
    dkappa_dt = kz_field.compute_temporal_derivative(particle_pos, order=1)
    print(f"∂κζ/∂t: mean={dkappa_dt.mean():.6f}, std={dkappa_dt.std():.6f}")

    # Oscillation metric
    oscillation = kz_field.compute_oscillation_metric(particle_pos, window=5)
    print(f"Oscillation strength: mean={oscillation.mean():.6f}, max={oscillation.max():.6f}")

    print("\n" + "="*80)
    print("All tests passed! κζ spatial field system is working.")
    print("="*80)
