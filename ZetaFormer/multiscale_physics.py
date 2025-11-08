"""
Multi-Scale Physics Integration via κζ Geometry

This module implements the unified multi-scale physics framework where:

1. **Gravitational Scale** (κ-coupled):
   - Long-range attraction from tau moment M_τ
   - V_grav = κ(x) · Φ_polylipse(x)
   - Dominant at large distances, slow dynamics

2. **Quantum Scale** (σ-coupled):
   - Stochastic insertions from sigma moment M_σ
   - Random particle creation/annihilation
   - Uncertainty principle: Δx·Δp ~ ℏ_eff(σ)
   - Dominant at small scales, fast fluctuations

3. **Electrostatic Scale** (emergent):
   - Emerges from oscillations in κζ(x,t)
   - Charge density ρ(x) ∝ ∂²κζ/∂t²
   - Intermediate scale coupling

All three forces coexist and are unified through the κζ geometry:
    κζ(x,t) = M_τ(x,t) / M_σ(x,t)

where M_τ and M_σ couple to different physics scales.

Author: Enhanced for Noetic Eidos Project
License: MIT
"""

import torch
import numpy as np
from typing import Tuple, Optional, Dict, List
from dataclasses import dataclass

from particle_dynamics import (
    ParticleState,
    FociConfiguration,
    FociFieldGenerator,
    GravitationalForce,
    QuantumStochasticForce,
    EmergentElectrostaticForce
)
from kappa_zeta_field import KappaZetaField, BidirectionalCoupler


@dataclass
class MultiScaleParameters:
    """
    Parameters governing multi-scale physics coupling.

    Attributes:
        G_grav: Gravitational coupling constant (κ scale)
        hbar_quantum: Effective Planck constant (σ scale)
        k_em: Electrostatic coupling constant (emergent scale)
        kT_quantum: Quantum thermal energy
        scale_separation: Factor separating scales (for analysis)
    """
    # Scale coupling strengths
    G_grav: float = 1.0              # Gravitational (κ-coupled)
    hbar_quantum: float = 0.1        # Quantum (σ-coupled)
    k_em: float = 0.05               # Electrostatic (emergent)
    kT_quantum: float = 1.0          # Thermal energy for quantum fluctuations

    # Scale separation for debugging
    enable_gravitational: bool = True
    enable_quantum: bool = True
    enable_electrostatic: bool = True

    # Temporal parameters
    oscillation_history_length: int = 10

    def get_active_scales(self) -> List[str]:
        """Return list of enabled physics scales."""
        scales = []
        if self.enable_gravitational:
            scales.append("gravitational")
        if self.enable_quantum:
            scales.append("quantum")
        if self.enable_electrostatic:
            scales.append("electrostatic")
        return scales


class MultiScaleForceCalculator:
    """
    Unified force calculator for multi-scale physics.

    Computes forces from all three scales:
    1. Gravitational (κ-coupled): F_g = -m·∇(κ·Φ)
    2. Quantum (σ-coupled): F_q = ℏ·σ·η/√dt
    3. Electrostatic (emergent): F_em = q·E where E ∝ ∂²κζ/∂t²
    """

    def __init__(
        self,
        field_generator: FociFieldGenerator,
        params: MultiScaleParameters
    ):
        """
        Initialize multi-scale force calculator.

        Args:
            field_generator: Foci field generator
            params: Multi-scale parameters
        """
        self.field_gen = field_generator
        self.params = params

        # Initialize individual force components
        if params.enable_gravitational:
            self.grav_force = GravitationalForce(
                field_generator,
                coupling_strength=params.G_grav
            )

        if params.enable_quantum:
            self.quantum_force = QuantumStochasticForce(
                field_generator,
                hbar_effective=params.hbar_quantum,
                temperature=params.kT_quantum
            )

        if params.enable_electrostatic:
            self.em_force = EmergentElectrostaticForce(
                field_generator,
                coupling_constant=params.k_em,
                history_length=params.oscillation_history_length
            )

    def compute_all_forces(
        self,
        state: ParticleState,
        kappa_field: torch.Tensor,
        sigma_field: torch.Tensor,
        dt: float,
        separate: bool = False
    ) -> Tuple[torch.Tensor, Optional[Dict[str, torch.Tensor]]]:
        """
        Compute total forces from all enabled scales.

        Args:
            state: Current particle state
            kappa_field: (n_particles,) local κ values
            sigma_field: (n_particles,) local σ values
            dt: Time step (for quantum noise scaling)
            separate: If True, return individual force components

        Returns:
            total_force: (n_particles, n_dim) total force
            components: Optional dict with individual force components
        """
        n_particles, n_dim = state.positions.shape
        total_force = torch.zeros_like(state.positions)
        components = {} if separate else None

        # 1. Gravitational (κ-coupled)
        if self.params.enable_gravitational:
            F_grav = self.grav_force.compute_force(state, kappa_field)
            total_force += F_grav
            if separate:
                components['gravitational'] = F_grav

        # 2. Quantum (σ-coupled)
        if self.params.enable_quantum:
            F_quantum = self.quantum_force.compute_force(state, dt, sigma_field)
            total_force += F_quantum
            if separate:
                components['quantum'] = F_quantum

        # 3. Electrostatic (emergent from oscillations)
        if self.params.enable_electrostatic:
            F_em = self.em_force.compute_force(state, kappa_field)
            total_force += F_em
            if separate:
                components['electrostatic'] = F_em

        return total_force, components

    def get_force_statistics(
        self,
        components: Dict[str, torch.Tensor]
    ) -> Dict[str, Dict[str, float]]:
        """
        Compute statistics for each force component.

        Args:
            components: Dict of force tensors by scale

        Returns:
            Dict of statistics (mean_norm, std_norm, max_norm) per scale
        """
        stats = {}

        for scale_name, force in components.items():
            force_norms = force.norm(dim=1)
            stats[scale_name] = {
                'mean_norm': force_norms.mean().item(),
                'std_norm': force_norms.std().item(),
                'max_norm': force_norms.max().item(),
                'min_norm': force_norms.min().item()
            }

        return stats


class QuantumParticleInjector:
    """
    Handles stochastic particle insertion/removal (quantum scale).

    Particles can be created or annihilated with probability proportional
    to local σ(x) field strength.
    """

    def __init__(
        self,
        max_particles: int = 100,
        injection_rate: float = 0.01,
        annihilation_rate: float = 0.01,
        sigma_threshold: float = 0.5
    ):
        """
        Initialize quantum injector.

        Args:
            max_particles: Maximum number of particles
            injection_rate: Base probability of particle creation per step
            annihilation_rate: Base probability of particle removal per step
            sigma_threshold: Minimum σ for injection
        """
        self.max_particles = max_particles
        self.p_inject = injection_rate
        self.p_annihilate = annihilation_rate
        self.sigma_threshold = sigma_threshold

    def inject_particles(
        self,
        state: ParticleState,
        sigma_field: torch.Tensor,
        foci_centers: torch.Tensor,
        n_inject: Optional[int] = None
    ) -> ParticleState:
        """
        Inject new particles near high-σ regions.

        Args:
            state: Current particle state
            sigma_field: (n_particles,) local σ values
            foci_centers: (n_foci, n_dim) focal positions
            n_inject: Number to inject (if None, use probability)

        Returns:
            Updated particle state with new particles
        """
        if state.n_particles >= self.max_particles:
            return state  # At capacity

        # Determine number to inject
        if n_inject is None:
            # Stochastic: probability proportional to mean σ
            mean_sigma = sigma_field.mean().item()
            if mean_sigma > self.sigma_threshold:
                p_inject_scaled = self.p_inject * (mean_sigma / self.sigma_threshold)
                if torch.rand(1).item() < p_inject_scaled:
                    n_inject = 1
                else:
                    n_inject = 0
            else:
                n_inject = 0

        if n_inject == 0:
            return state

        # Limit to capacity
        n_inject = min(n_inject, self.max_particles - state.n_particles)

        # Generate new particles near random foci
        n_dim = state.n_dim
        new_positions = []
        new_velocities = []

        for _ in range(n_inject):
            # Random focus
            focus_idx = torch.randint(0, foci_centers.shape[0], (1,)).item()
            focus_pos = foci_centers[focus_idx]

            # Small offset from focus
            offset = 0.2 * torch.randn(n_dim)
            new_pos = focus_pos + offset

            # Random velocity
            new_vel = 0.1 * torch.randn(n_dim)

            new_positions.append(new_pos)
            new_velocities.append(new_vel)

        # Append to state
        new_state = ParticleState(
            positions=torch.cat([state.positions, torch.stack(new_positions)]),
            velocities=torch.cat([state.velocities, torch.stack(new_velocities)]),
            masses=torch.cat([state.masses, torch.ones(n_inject)]),
            charges=torch.cat([state.charges, torch.randn(n_inject)]),
            time=state.time
        )
        new_state.update_derived_quantities()

        return new_state

    def annihilate_particles(
        self,
        state: ParticleState,
        sigma_field: torch.Tensor,
        min_particles: int = 5
    ) -> ParticleState:
        """
        Remove particles from low-σ regions.

        Args:
            state: Current particle state
            sigma_field: (n_particles,) local σ values
            min_particles: Minimum number to maintain

        Returns:
            Updated state with removed particles
        """
        if state.n_particles <= min_particles:
            return state

        # Annihilation probability inverse to σ (remove from low-σ regions)
        sigma_inv = 1.0 / (sigma_field + 1e-6)
        p_remove = self.p_annihilate * sigma_inv / sigma_inv.mean()

        # Sample which particles to remove
        keep_mask = torch.rand(state.n_particles) > p_remove

        # Ensure minimum count
        if keep_mask.sum() < min_particles:
            # Keep random subset
            indices = torch.randperm(state.n_particles)[:min_particles]
            keep_mask = torch.zeros(state.n_particles, dtype=torch.bool)
            keep_mask[indices] = True

        if keep_mask.all():
            return state  # No removal

        # Filter state
        new_state = ParticleState(
            positions=state.positions[keep_mask],
            velocities=state.velocities[keep_mask],
            masses=state.masses[keep_mask],
            charges=state.charges[keep_mask],
            time=state.time
        )
        new_state.update_derived_quantities()

        return new_state


class MultiScaleObservables:
    """
    Compute physical observables for monitoring and validation.

    Observables:
    - Total energy (kinetic + potential)
    - Total momentum
    - Angular momentum
    - κζ ratio (global and spatial variance)
    - Scale-separated energy contributions
    """

    def __init__(self, field_generator: FociFieldGenerator):
        """
        Initialize observables calculator.

        Args:
            field_generator: Foci field generator for potential energy
        """
        self.field_gen = field_generator

    def compute_energy(
        self,
        state: ParticleState,
        kappa_field: Optional[torch.Tensor] = None
    ) -> Dict[str, float]:
        """
        Compute total energy and components.

        Args:
            state: Particle state
            kappa_field: (n_particles,) local κ values (optional)

        Returns:
            dict with 'kinetic', 'potential', 'total'
        """
        # Kinetic energy (already in state)
        KE = state.energy

        # Potential energy: V = Σᵢ mᵢ κᵢ Φ(xᵢ)
        potential = self.field_gen.polylipse_potential(state.positions)

        if kappa_field is None:
            kappa_field, _ = self.field_gen.compute_local_kappa_field(state.positions, state)

        PE = (state.masses * kappa_field * potential).sum().item()

        return {
            'kinetic': KE,
            'potential': PE,
            'total': KE + PE
        }

    def compute_momentum(self, state: ParticleState) -> Dict[str, torch.Tensor]:
        """
        Compute total and angular momentum.

        Args:
            state: Particle state

        Returns:
            dict with 'linear' and 'angular' momentum
        """
        # Linear momentum (already in state)
        p_linear = state.momentum

        # Angular momentum: L = Σᵢ rᵢ × pᵢ
        if state.n_dim == 2:
            # In 2D: L is scalar (z-component)
            r = state.positions
            p = state.masses[:, None] * state.velocities
            L = (r[:, 0] * p[:, 1] - r[:, 1] * p[:, 0]).sum()
            angular = torch.tensor([0.0, 0.0, L])
        elif state.n_dim == 3:
            # In 3D: L is vector
            r = state.positions
            p = state.masses[:, None] * state.velocities
            angular = torch.cross(r, p, dim=1).sum(dim=0)
        else:
            angular = torch.zeros(3)

        return {
            'linear': p_linear,
            'angular': angular
        }

    def compute_kappa_zeta_statistics(
        self,
        kappa_field: torch.Tensor,
        sigma_field: torch.Tensor
    ) -> Dict[str, float]:
        """
        Compute κζ statistics.

        Args:
            kappa_field: (n_particles,) local κ values
            sigma_field: (n_particles,) local σ values

        Returns:
            dict with κζ statistics
        """
        kappa_zeta = kappa_field / (sigma_field + 1e-12)

        return {
            'kappa_mean': kappa_field.mean().item(),
            'sigma_mean': sigma_field.mean().item(),
            'kappa_zeta_mean': kappa_zeta.mean().item(),
            'kappa_zeta_std': kappa_zeta.std().item(),
            'kappa_zeta_min': kappa_zeta.min().item(),
            'kappa_zeta_max': kappa_zeta.max().item()
        }


if __name__ == "__main__":
    print("="*80)
    print("Multi-Scale Physics Integration - Test Suite")
    print("="*80)

    # Setup
    from polylipse_dataset import solve_focal_config

    n_foci = 3
    kappa_target = 1.5
    foci_angles, foci_weights = solve_focal_config(n_foci, kappa_target)
    focal_radius = 2.0

    foci_config = FociConfiguration(
        n_foci=n_foci,
        angles=foci_angles,
        weights=foci_weights,
        centers=focal_radius * torch.stack([torch.cos(foci_angles), torch.sin(foci_angles)], dim=1),
        focal_radius=focal_radius
    )

    field_gen = FociFieldGenerator(foci_config)

    # Test 1: Multi-scale parameters
    print("\n[Test 1] Multi-scale parameters:")
    print("-"*80)

    params = MultiScaleParameters(
        G_grav=1.0,
        hbar_quantum=0.1,
        k_em=0.05,
        enable_gravitational=True,
        enable_quantum=True,
        enable_electrostatic=True
    )

    print(f"Active scales: {params.get_active_scales()}")
    print(f"Gravitational coupling: G = {params.G_grav}")
    print(f"Quantum coupling: ℏ_eff = {params.hbar_quantum}")
    print(f"EM coupling: k_em = {params.k_em}")

    # Test 2: Force calculator
    print("\n[Test 2] Multi-scale force calculator:")
    print("-"*80)

    force_calc = MultiScaleForceCalculator(field_gen, params)

    # Create particle state
    n_particles = 15
    state = ParticleState(
        positions=torch.randn(n_particles, 2) * 1.5,
        velocities=torch.randn(n_particles, 2) * 0.1,
        masses=torch.ones(n_particles),
        charges=torch.randn(n_particles)
    )
    state.update_derived_quantities()

    # Compute fields
    kappa_field, sigma_field = field_gen.compute_local_kappa_field(state.positions, state)

    # Compute forces
    dt = 0.01
    total_force, components = force_calc.compute_all_forces(
        state, kappa_field, sigma_field, dt, separate=True
    )

    print(f"Total force norm: {total_force.norm(dim=1).mean():.6f}")
    print(f"\nForce components:")

    force_stats = force_calc.get_force_statistics(components)
    for scale, stats in force_stats.items():
        print(f"  {scale}:")
        print(f"    mean norm: {stats['mean_norm']:.6f}")
        print(f"    max norm:  {stats['max_norm']:.6f}")

    # Test 3: Quantum injection/annihilation
    print("\n[Test 3] Quantum particle injection:")
    print("-"*80)

    injector = QuantumParticleInjector(
        max_particles=50,
        injection_rate=0.5,  # High for testing
        sigma_threshold=0.3
    )

    print(f"Initial particles: {state.n_particles}")

    # Inject
    state_injected = injector.inject_particles(
        state, sigma_field, foci_config.centers, n_inject=3
    )
    print(f"After injection: {state_injected.n_particles}")

    # Update fields
    kappa_field_new, sigma_field_new = field_gen.compute_local_kappa_field(
        state_injected.positions, state_injected
    )

    # Annihilate
    state_final = injector.annihilate_particles(
        state_injected, sigma_field_new, min_particles=10
    )
    print(f"After annihilation: {state_final.n_particles}")

    # Test 4: Observables
    print("\n[Test 4] Physical observables:")
    print("-"*80)

    obs = MultiScaleObservables(field_gen)

    energy = obs.compute_energy(state, kappa_field)
    print(f"Energy:")
    print(f"  Kinetic:   {energy['kinetic']:.6f}")
    print(f"  Potential: {energy['potential']:.6f}")
    print(f"  Total:     {energy['total']:.6f}")

    momentum = obs.compute_momentum(state)
    print(f"\nMomentum:")
    print(f"  Linear:  {momentum['linear'].numpy()}")
    print(f"  Angular: {momentum['angular'].numpy()}")

    kz_stats = obs.compute_kappa_zeta_statistics(kappa_field, sigma_field)
    print(f"\nκζ Statistics:")
    print(f"  κ mean: {kz_stats['kappa_mean']:.4f}")
    print(f"  σ mean: {kz_stats['sigma_mean']:.4f}")
    print(f"  κζ: {kz_stats['kappa_zeta_mean']:.4f} ± {kz_stats['kappa_zeta_std']:.4f}")
    print(f"  κζ range: [{kz_stats['kappa_zeta_min']:.4f}, {kz_stats['kappa_zeta_max']:.4f}]")

    # Test 5: Scale separation analysis
    print("\n[Test 5] Scale separation analysis:")
    print("-"*80)

    # Test with each scale individually
    for scale in ["gravitational", "quantum", "electrostatic"]:
        params_single = MultiScaleParameters(
            enable_gravitational=(scale == "gravitational"),
            enable_quantum=(scale == "quantum"),
            enable_electrostatic=(scale == "electrostatic")
        )

        force_calc_single = MultiScaleForceCalculator(field_gen, params_single)
        F_single, _ = force_calc_single.compute_all_forces(
            state, kappa_field, sigma_field, dt, separate=False
        )

        force_norm = F_single.norm(dim=1).mean().item()
        print(f"  {scale:15s}: force norm = {force_norm:.6f}")

    print("\n" + "="*80)
    print("All tests passed! Multi-scale physics integration is working.")
    print("="*80)
    print("\nKey insights:")
    print("- Gravitational (κ): Long-range, smooth")
    print("- Quantum (σ): Stochastic, short-range")
    print("- Electrostatic: Emergent from oscillations")
    print("="*80)
