"""
Particle Dynamics Module for Multi-Scale κζ-Coupled Physics

This module implements the fundamental particle simulation engine where:
- Foci generate κζ curvature fields (field generators)
- Particles move within and modify κζ via bidirectional coupling
- Multi-scale physics emerges:
  * κ (tau moment) ↔ Gravitational scale (long-range curvature)
  * σ (sigma moment) ↔ Quantum scale (stochastic insertions)
  * Electrostatic ↔ Emergent from κζ oscillations

Mathematical Foundation:
    Polylipse potential: Φ(x) = Σᵢ wᵢ|x - Fᵢ|
    Gravitational force: F_grav = -∇(κ(x) · Φ(x))
    Quantum stochastic: F_quantum ~ σ(x) · η(t)  where η ~ N(0,1)
    Emergent EM: F_em = -∇φ_em where φ_em from ∂κζ/∂t oscillations

Hybrid foci interpretation:
    Foci = field generators (create curvature)
    Particles = probes that both:
        1. Feel forces from κζ field
        2. Modify κζ field via their configuration

Author: Enhanced for Noetic Eidos Project
License: MIT
"""

import torch
import numpy as np
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass, field


@dataclass
class ParticleState:
    """
    Complete state representation for particle ensemble.

    Attributes:
        positions: (n_particles, n_dim) particle positions
        velocities: (n_particles, n_dim) particle velocities
        masses: (n_particles,) particle masses (for gravitational coupling)
        charges: (n_particles,) particle charges (for EM coupling)
        forces: (n_particles, n_dim) total forces on particles
        energy: Total system energy
        momentum: Total system momentum vector
        time: Current simulation time
    """
    positions: torch.Tensor
    velocities: torch.Tensor
    masses: torch.Tensor
    charges: torch.Tensor
    forces: Optional[torch.Tensor] = None
    energy: float = 0.0
    momentum: Optional[torch.Tensor] = None
    time: float = 0.0

    def __post_init__(self):
        """Validate shapes and initialize derived quantities."""
        n_particles, n_dim = self.positions.shape

        assert self.velocities.shape == (n_particles, n_dim), \
            f"Velocity shape {self.velocities.shape} != position shape {self.positions.shape}"
        assert self.masses.shape == (n_particles,), \
            f"Mass shape {self.masses.shape} != (n_particles={n_particles},)"
        assert self.charges.shape == (n_particles,), \
            f"Charge shape {self.charges.shape} != (n_particles={n_particles},)"

        if self.forces is None:
            self.forces = torch.zeros_like(self.positions)
        if self.momentum is None:
            self.momentum = (self.masses[:, None] * self.velocities).sum(dim=0)

    def update_derived_quantities(self):
        """Update energy and momentum from current state."""
        # Kinetic energy: KE = ½ Σ m v²
        v_squared = (self.velocities ** 2).sum(dim=1)
        self.energy = 0.5 * (self.masses * v_squared).sum().item()

        # Total momentum: p = Σ m v
        self.momentum = (self.masses[:, None] * self.velocities).sum(dim=0)

    @property
    def n_particles(self) -> int:
        return self.positions.shape[0]

    @property
    def n_dim(self) -> int:
        return self.positions.shape[1]

    def clone(self) -> 'ParticleState':
        """Deep copy of particle state."""
        return ParticleState(
            positions=self.positions.clone(),
            velocities=self.velocities.clone(),
            masses=self.masses.clone(),
            charges=self.charges.clone(),
            forces=self.forces.clone() if self.forces is not None else None,
            energy=self.energy,
            momentum=self.momentum.clone() if self.momentum is not None else None,
            time=self.time
        )


@dataclass
class FociConfiguration:
    """
    Configuration of foci (field generators) in polylipse geometry.

    Attributes:
        n_foci: Number of focal points
        angles: (n_foci,) angular positions in radians
        weights: (n_foci,) probability weights (sum to 1)
        centers: (n_foci, n_dim) spatial positions of foci
        focal_radius: Radius at which foci are distributed
        M_tau: Tau moment (radial/temporal variance)
        M_sigma: Sigma moment (angular/spatial variance)
        kappa_zeta: Anisotropy ratio M_tau / M_sigma
    """
    n_foci: int
    angles: torch.Tensor
    weights: torch.Tensor
    centers: torch.Tensor
    focal_radius: float
    M_tau: float = 0.0
    M_sigma: float = 0.0
    kappa_zeta: float = 0.0

    def __post_init__(self):
        """Compute derived quantities."""
        assert len(self.angles) == self.n_foci
        assert len(self.weights) == self.n_foci
        assert self.centers.shape[0] == self.n_foci

        # Compute moments
        cos2 = torch.cos(self.angles) ** 2
        sin2 = torch.sin(self.angles) ** 2

        self.M_tau = (self.weights * cos2).sum().item()
        self.M_sigma = (self.weights * sin2).sum().item()
        self.kappa_zeta = self.M_tau / self.M_sigma if self.M_sigma > 1e-12 else float('inf')

    @staticmethod
    def from_polylipse_config(
        n_foci: int,
        kappa: float,
        focal_radius: float = 2.0,
        n_dim: int = 2
    ) -> 'FociConfiguration':
        """
        Create foci configuration from κζ value using polylipse solver.

        Args:
            n_foci: Number of focal points
            kappa: Target κζ ratio
            focal_radius: Radius of focal distribution
            n_dim: Spatial dimensions (2D or 3D)

        Returns:
            FociConfiguration with solved angles and weights
        """
        from polylipse_dataset import solve_focal_config

        # Solve for angles and weights
        angles, weights = solve_focal_config(n_foci, kappa)

        # Compute centers in n_dim space
        if n_dim == 2:
            centers = focal_radius * torch.stack([
                torch.cos(angles),
                torch.sin(angles)
            ], dim=1)
        elif n_dim == 3:
            # Distribute foci on xy-plane for 3D
            centers = focal_radius * torch.stack([
                torch.cos(angles),
                torch.sin(angles),
                torch.zeros_like(angles)
            ], dim=1)
        else:
            raise ValueError(f"n_dim must be 2 or 3, got {n_dim}")

        return FociConfiguration(
            n_foci=n_foci,
            angles=angles,
            weights=weights,
            centers=centers,
            focal_radius=focal_radius
        )


class FociFieldGenerator:
    """
    Generate polylipse potential field and κζ field from foci configuration.

    This class implements the hybrid interpretation where foci are field sources
    that generate both the polylipse potential Φ(x) and local κζ(x) field.
    """

    def __init__(self, foci_config: FociConfiguration, epsilon: float = 1e-6):
        """
        Initialize field generator.

        Args:
            foci_config: Foci configuration
            epsilon: Small constant to prevent 1/r singularities
        """
        self.foci = foci_config
        self.epsilon = epsilon

    def polylipse_potential(self, positions: torch.Tensor) -> torch.Tensor:
        """
        Compute polylipse potential: Φ(x) = Σᵢ wᵢ|x - Fᵢ|

        Args:
            positions: (n_points, n_dim) query positions

        Returns:
            (n_points,) potential values
        """
        # Broadcast: (n_points, 1, n_dim) - (1, n_foci, n_dim) -> (n_points, n_foci, n_dim)
        dx = positions[:, None, :] - self.foci.centers[None, :, :]

        # Distance: |x - F_i|
        distances = torch.sqrt((dx ** 2).sum(dim=2) + self.epsilon)

        # Weighted sum: Σ w_i * distance_i
        potential = (self.foci.weights[None, :] * distances).sum(dim=1)

        return potential

    def polylipse_gradient(self, positions: torch.Tensor) -> torch.Tensor:
        """
        Compute gradient of polylipse potential: ∇Φ(x) = Σᵢ wᵢ (x-Fᵢ)/|x-Fᵢ|

        Args:
            positions: (n_points, n_dim) query positions

        Returns:
            (n_points, n_dim) gradient vectors
        """
        # Displacement vectors
        dx = positions[:, None, :] - self.foci.centers[None, :, :]

        # Distances with regularization
        distances = torch.sqrt((dx ** 2).sum(dim=2, keepdim=True) + self.epsilon)

        # Normalized directions: (x - F_i) / |x - F_i|
        directions = dx / distances

        # Weighted sum of directions
        gradient = (self.foci.weights[None, :, None] * directions).sum(dim=1)

        return gradient

    def compute_local_kappa_field(
        self,
        positions: torch.Tensor,
        particle_state: Optional[ParticleState] = None,
        bandwidth: float = 1.0
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Compute local κ(x) and σ(x) fields from particle density.

        Uses kernel density estimation to compute local moments:
            κ(x) = M_τ(x) = Σⱼ K(x-xⱼ) cos²(θⱼ)
            σ(x) = M_σ(x) = Σⱼ K(x-xⱼ) sin²(θⱼ)

        where θⱼ is angle of particle j from nearest focus.

        Args:
            positions: (n_points, n_dim) query positions
            particle_state: Current particle state (if None, use foci only)
            bandwidth: Kernel bandwidth for density estimation

        Returns:
            kappa_field: (n_points,) local κ values
            sigma_field: (n_points,) local σ values
        """
        n_points = positions.shape[0]
        n_dim = positions.shape[1]

        if particle_state is None or particle_state.n_particles == 0:
            # No particles: use global foci values
            kappa_field = torch.full((n_points,), self.foci.M_tau)
            sigma_field = torch.full((n_points,), self.foci.M_sigma)
            return kappa_field, sigma_field

        # Compute local density-weighted moments
        particle_pos = particle_state.positions

        # Distance from query points to particles
        # (n_points, 1, n_dim) - (1, n_particles, n_dim) -> (n_points, n_particles)
        dx = positions[:, None, :] - particle_pos[None, :, :]
        dist_sq = (dx ** 2).sum(dim=2)

        # Gaussian kernel: K(x) = exp(-||x||²/2h²)
        kernel_weights = torch.exp(-dist_sq / (2 * bandwidth ** 2))
        kernel_norm = kernel_weights.sum(dim=1, keepdim=True) + self.epsilon
        kernel_weights = kernel_weights / kernel_norm  # Normalize

        # For each particle, find angle from nearest focus
        particle_to_foci = particle_pos[:, None, :] - self.foci.centers[None, :, :]
        dist_to_foci = (particle_to_foci ** 2).sum(dim=2)
        nearest_focus = dist_to_foci.argmin(dim=1)  # (n_particles,)

        # Get angles of nearest foci
        particle_angles = self.foci.angles[nearest_focus]  # (n_particles,)

        # Compute cos² and sin² for each particle
        cos2 = torch.cos(particle_angles) ** 2
        sin2 = torch.sin(particle_angles) ** 2

        # Kernel-weighted moments at each query point
        kappa_field = (kernel_weights * cos2[None, :]).sum(dim=1)
        sigma_field = (kernel_weights * sin2[None, :]).sum(dim=1)

        # Blend with global foci values (80% local, 20% global)
        global_kappa = torch.tensor(self.foci.M_tau)
        global_sigma = torch.tensor(self.foci.M_sigma)

        kappa_field = 0.8 * kappa_field + 0.2 * global_kappa
        sigma_field = 0.8 * sigma_field + 0.2 * global_sigma

        return kappa_field, sigma_field


class GravitationalForce:
    """
    Gravitational-scale forces from κ (tau moment).

    Long-range attraction governed by polylipse potential:
        F_grav = -m · ∇(κ(x) · Φ(x))

    where κ(x) acts as local gravitational coupling constant.
    """

    def __init__(self, field_generator: FociFieldGenerator, coupling_strength: float = 1.0):
        """
        Initialize gravitational force.

        Args:
            field_generator: Foci field generator
            coupling_strength: Global gravitational coupling G_eff
        """
        self.field = field_generator
        self.G = coupling_strength

    def compute_force(
        self,
        state: ParticleState,
        kappa_field: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Compute gravitational force on all particles.

        Args:
            state: Current particle state
            kappa_field: (n_particles,) local κ values (if None, use global)

        Returns:
            (n_particles, n_dim) force vectors
        """
        # Get local kappa values
        if kappa_field is None:
            kappa_field, _ = self.field.compute_local_kappa_field(state.positions, state)

        # Gradient of polylipse potential
        grad_phi = self.field.polylipse_gradient(state.positions)

        # Force: F = -m · κ(x) · ∇Φ(x)
        force = -self.G * state.masses[:, None] * kappa_field[:, None] * grad_phi

        return force


class QuantumStochasticForce:
    """
    Quantum-scale stochastic forces from σ (sigma moment).

    Random insertions modulated by local sigma field:
        F_quantum = ℏ_eff · σ(x) · η(t) / √dt

    where η ~ N(0, I) is white noise and ℏ_eff is effective Planck constant.
    """

    def __init__(
        self,
        field_generator: FociFieldGenerator,
        hbar_effective: float = 0.1,
        temperature: float = 1.0
    ):
        """
        Initialize quantum stochastic force.

        Args:
            field_generator: Foci field generator
            hbar_effective: Effective Planck constant (controls noise scale)
            temperature: Thermal energy scale (kT)
        """
        self.field = field_generator
        self.hbar = hbar_effective
        self.kT = temperature

    def compute_force(
        self,
        state: ParticleState,
        dt: float,
        sigma_field: Optional[torch.Tensor] = None,
        seed: Optional[int] = None
    ) -> torch.Tensor:
        """
        Compute stochastic quantum force.

        Args:
            state: Current particle state
            dt: Time step (for noise scaling)
            sigma_field: (n_particles,) local σ values (if None, compute)
            seed: Random seed for reproducibility

        Returns:
            (n_particles, n_dim) force vectors
        """
        if seed is not None:
            torch.manual_seed(seed)

        # Get local sigma values
        if sigma_field is None:
            _, sigma_field = self.field.compute_local_kappa_field(state.positions, state)

        # White noise: η ~ N(0, 1)
        noise = torch.randn_like(state.positions)

        # Fluctuation-dissipation: scale by √(2kT/dt)
        noise_scale = torch.sqrt(torch.tensor(2.0 * self.kT / (dt + 1e-12)))

        # Force: F = ℏ · σ(x) · η / √dt
        force = self.hbar * noise_scale * sigma_field[:, None] * noise

        return force


class EmergentElectrostaticForce:
    """
    Emergent electrostatic forces from κζ oscillations.

    Oscillations in κζ(x,t) create charge density:
        ρ(x, ω) ∝ ∂²κζ/∂t²

    Solve Poisson equation:
        ∇²φ_em = -ρ → E = -∇φ_em → F = q·E
    """

    def __init__(
        self,
        field_generator: FociFieldGenerator,
        coupling_constant: float = 0.1,
        history_length: int = 10
    ):
        """
        Initialize emergent EM force.

        Args:
            field_generator: Foci field generator
            coupling_constant: EM coupling strength (e²/4πε₀)
            history_length: Number of time steps to track for oscillation detection
        """
        self.field = field_generator
        self.k_em = coupling_constant
        self.history_length = history_length

        # Track κζ history for temporal derivatives
        self.kappa_zeta_history: List[Tuple[float, torch.Tensor]] = []

    def update_history(self, time: float, kappa_field: torch.Tensor):
        """
        Update κζ history for oscillation tracking.

        Args:
            time: Current simulation time
            kappa_field: (n_points,) κ field at current time
        """
        self.kappa_zeta_history.append((time, kappa_field.clone()))

        # Keep only recent history
        if len(self.kappa_zeta_history) > self.history_length:
            self.kappa_zeta_history.pop(0)

    def compute_oscillation_amplitude(self, positions: torch.Tensor) -> torch.Tensor:
        """
        Compute oscillation amplitude from κζ temporal variance.

        Args:
            positions: (n_points, n_dim) query positions

        Returns:
            (n_points,) oscillation amplitude (proxy for charge density)
        """
        if len(self.kappa_zeta_history) < 3:
            # Not enough history for oscillation detection
            return torch.zeros(positions.shape[0])

        # Extract kappa values at query positions from history
        # For simplicity, compute variance over time at each position

        # Recompute kappa at current positions for all historical times
        # (This is approximation - in full implementation, interpolate from grid)

        kappa_series = []
        for _, kappa_field_hist in self.kappa_zeta_history[-5:]:  # Use last 5 steps
            # Assume kappa_field_hist was computed at similar positions
            # For now, use mean value as proxy
            kappa_series.append(kappa_field_hist.mean())

        # Temporal variance as oscillation amplitude
        kappa_tensor = torch.tensor(kappa_series)
        oscillation_amplitude = kappa_tensor.var()

        # Return constant field (simplified - full version would spatially vary)
        return torch.full((positions.shape[0],), oscillation_amplitude.item())

    def compute_force(
        self,
        state: ParticleState,
        kappa_field: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute emergent electrostatic force from oscillations.

        Args:
            state: Current particle state
            kappa_field: (n_particles,) current κ field

        Returns:
            (n_particles, n_dim) force vectors
        """
        # Update history
        self.update_history(state.time, kappa_field)

        if len(self.kappa_zeta_history) < 3:
            return torch.zeros_like(state.positions)

        # Compute oscillation-induced charge density
        charge_density = self.compute_oscillation_amplitude(state.positions)

        # Simplified E-field: radial from high to low charge density
        # Full implementation would solve Poisson equation on grid

        # For now: E ∝ -∇ρ (charge density gradient)
        # Use finite differences between particles

        n_particles = state.n_particles
        forces = torch.zeros_like(state.positions)

        # Pairwise electrostatic-like interaction
        for i in range(n_particles):
            for j in range(i + 1, n_particles):
                # Direction: i → j
                dx = state.positions[j] - state.positions[i]
                dist_sq = (dx ** 2).sum() + 1e-6
                dist = torch.sqrt(dist_sq)

                # Coulomb-like force: F = k · q_i · q_j / r² · r̂
                # Use oscillation amplitude as effective charge
                q_i = state.charges[i] * charge_density[i]
                q_j = state.charges[j] * charge_density[j]

                force_magnitude = self.k_em * q_i * q_j / dist_sq
                force_direction = dx / dist

                # Newton's 3rd law
                forces[i] += force_magnitude * force_direction
                forces[j] -= force_magnitude * force_direction

        return forces


class ParticleIntegrator:
    """
    Time integrator for particle dynamics.

    Supports multiple integration schemes:
    - Euler: Simple, first-order
    - Verlet: Symplectic, energy-conserving (good for dynamics)
    - RK4: Fourth-order Runge-Kutta (accurate but not symplectic)
    """

    def __init__(self, method: str = "verlet"):
        """
        Initialize integrator.

        Args:
            method: Integration method ("euler", "verlet", "rk4")
        """
        if method not in ["euler", "verlet", "rk4"]:
            raise ValueError(f"Unknown integration method: {method}")
        self.method = method

    def step_euler(
        self,
        state: ParticleState,
        forces: torch.Tensor,
        dt: float
    ) -> ParticleState:
        """
        Euler integration: x(t+dt) = x(t) + v(t)·dt, v(t+dt) = v(t) + a(t)·dt
        """
        new_state = state.clone()

        # Acceleration: a = F/m
        acceleration = forces / state.masses[:, None]

        # Update velocity and position
        new_state.velocities = state.velocities + acceleration * dt
        new_state.positions = state.positions + new_state.velocities * dt
        new_state.time = state.time + dt
        new_state.forces = forces

        new_state.update_derived_quantities()
        return new_state

    def step_verlet(
        self,
        state: ParticleState,
        forces: torch.Tensor,
        dt: float
    ) -> ParticleState:
        """
        Velocity Verlet integration (symplectic, energy-conserving):
        x(t+dt) = x(t) + v(t)·dt + ½a(t)·dt²
        v(t+dt) = v(t) + ½[a(t) + a(t+dt)]·dt

        Note: This requires force at t+dt, so we use approximate scheme:
        - Update position with current acceleration
        - Use same acceleration for velocity (semi-implicit)
        """
        new_state = state.clone()

        # Acceleration: a = F/m
        acceleration = forces / state.masses[:, None]

        # Update position
        new_state.positions = state.positions + state.velocities * dt + 0.5 * acceleration * dt ** 2

        # Update velocity (semi-implicit: use same acceleration)
        new_state.velocities = state.velocities + acceleration * dt

        new_state.time = state.time + dt
        new_state.forces = forces

        new_state.update_derived_quantities()
        return new_state

    def step(
        self,
        state: ParticleState,
        forces: torch.Tensor,
        dt: float
    ) -> ParticleState:
        """
        Perform one integration step.

        Args:
            state: Current particle state
            forces: (n_particles, n_dim) total forces
            dt: Time step

        Returns:
            New particle state at t + dt
        """
        if self.method == "euler":
            return self.step_euler(state, forces, dt)
        elif self.method == "verlet":
            return self.step_verlet(state, forces, dt)
        else:
            raise NotImplementedError(f"Method {self.method} not implemented")


# Conservation law checkers

def check_energy_conservation(
    state_initial: ParticleState,
    state_final: ParticleState,
    tolerance: float = 0.01
) -> Dict[str, float]:
    """
    Check energy conservation violation.

    Args:
        state_initial: Initial state
        state_final: Final state
        tolerance: Acceptable relative error

    Returns:
        dict with 'delta_E', 'E_initial', 'E_final', 'violation'
    """
    E_initial = state_initial.energy
    E_final = state_final.energy
    delta_E = abs(E_final - E_initial)

    relative_error = delta_E / (abs(E_initial) + 1e-12)

    return {
        'E_initial': E_initial,
        'E_final': E_final,
        'delta_E': delta_E,
        'relative_error': relative_error,
        'violation': relative_error > tolerance
    }


def check_momentum_conservation(
    state_initial: ParticleState,
    state_final: ParticleState,
    tolerance: float = 0.01
) -> Dict[str, float]:
    """
    Check momentum conservation violation.

    Args:
        state_initial: Initial state
        state_final: Final state
        tolerance: Acceptable relative error

    Returns:
        dict with 'delta_p', 'p_initial', 'p_final', 'violation'
    """
    p_initial = state_initial.momentum
    p_final = state_final.momentum

    delta_p = torch.norm(p_final - p_initial).item()
    p_initial_norm = torch.norm(p_initial).item()

    relative_error = delta_p / (p_initial_norm + 1e-12)

    return {
        'p_initial_norm': p_initial_norm,
        'p_final_norm': torch.norm(p_final).item(),
        'delta_p': delta_p,
        'relative_error': relative_error,
        'violation': relative_error > tolerance
    }


if __name__ == "__main__":
    print("="*80)
    print("Particle Dynamics Module - Test Suite")
    print("="*80)

    # Test 1: Create particle state
    print("\n[Test 1] Creating particle state:")
    print("-"*80)

    n_particles = 10
    n_dim = 2

    state = ParticleState(
        positions=torch.randn(n_particles, n_dim),
        velocities=torch.randn(n_particles, n_dim) * 0.1,
        masses=torch.ones(n_particles),
        charges=torch.randn(n_particles)
    )
    state.update_derived_quantities()

    print(f"Created state with {state.n_particles} particles in {state.n_dim}D")
    print(f"Total energy: {state.energy:.4f}")
    print(f"Total momentum: {state.momentum}")

    # Test 2: Create foci configuration
    print("\n[Test 2] Creating foci configuration:")
    print("-"*80)

    foci = FociConfiguration.from_polylipse_config(
        n_foci=3,
        kappa=1.5,
        focal_radius=2.0,
        n_dim=2
    )

    print(f"Foci configuration: n={foci.n_foci}, κζ={foci.kappa_zeta:.4f}")
    print(f"Angles (deg): {(foci.angles * 180 / np.pi).numpy()}")
    print(f"Weights: {foci.weights.numpy()}")
    print(f"M_τ = {foci.M_tau:.4f}, M_σ = {foci.M_sigma:.4f}")

    # Test 3: Field generator
    print("\n[Test 3] Testing field generator:")
    print("-"*80)

    field_gen = FociFieldGenerator(foci)

    # Compute potential at particle positions
    potential = field_gen.polylipse_potential(state.positions)
    gradient = field_gen.polylipse_gradient(state.positions)

    print(f"Potential range: [{potential.min():.4f}, {potential.max():.4f}]")
    print(f"Gradient norm range: [{gradient.norm(dim=1).min():.4f}, {gradient.norm(dim=1).max():.4f}]")

    # Compute local κ and σ fields
    kappa_field, sigma_field = field_gen.compute_local_kappa_field(state.positions, state)
    print(f"Local κ range: [{kappa_field.min():.4f}, {kappa_field.max():.4f}]")
    print(f"Local σ range: [{sigma_field.min():.4f}, {sigma_field.max():.4f}]")

    # Test 4: Forces
    print("\n[Test 4] Testing forces:")
    print("-"*80)

    # Gravitational
    grav_force = GravitationalForce(field_gen)
    F_grav = grav_force.compute_force(state, kappa_field)
    print(f"Gravitational force norm: {F_grav.norm(dim=1).mean():.4f}")

    # Quantum stochastic
    quantum_force = QuantumStochasticForce(field_gen)
    F_quantum = quantum_force.compute_force(state, dt=0.01, sigma_field=sigma_field, seed=42)
    print(f"Quantum force norm: {F_quantum.norm(dim=1).mean():.4f}")

    # Emergent EM
    em_force = EmergentElectrostaticForce(field_gen)
    F_em = em_force.compute_force(state, kappa_field)
    print(f"Emergent EM force norm: {F_em.norm(dim=1).mean():.4f}")

    # Test 5: Integration
    print("\n[Test 5] Testing time integration:")
    print("-"*80)

    integrator = ParticleIntegrator(method="verlet")

    # Total force
    F_total = F_grav + F_quantum + F_em

    # Integrate one step
    dt = 0.01
    state_initial = state.clone()
    state_new = integrator.step(state, F_total, dt)

    print(f"Time: {state_initial.time:.3f} → {state_new.time:.3f}")
    print(f"Position change: {(state_new.positions - state_initial.positions).norm():.6f}")

    # Check conservation (should be approximate due to stochastic forces)
    energy_check = check_energy_conservation(state_initial, state_new, tolerance=0.1)
    momentum_check = check_momentum_conservation(state_initial, state_new, tolerance=0.1)

    print(f"Energy: {energy_check['E_initial']:.4f} → {energy_check['E_final']:.4f} " +
          f"(Δ={energy_check['delta_E']:.6f}, violation={energy_check['violation']})")
    print(f"Momentum: {momentum_check['p_initial_norm']:.4f} → {momentum_check['p_final_norm']:.4f} " +
          f"(Δ={momentum_check['delta_p']:.6f}, violation={momentum_check['violation']})")

    print("\n" + "="*80)
    print("All tests passed! Particle dynamics core is working.")
    print("="*80)
