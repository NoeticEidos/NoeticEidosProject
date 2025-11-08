# κζ-Coupled Particle Physics Framework

## Multi-Scale Interaction Modeling via Geometric κζ Dynamics

**Author:** Enhanced for Noetic Eidos Project
**License:** MIT
**Status:** Fully Implemented ✓

---

## Overview

This framework implements a unified multi-scale physics model where **gravitational**, **quantum**, and **electrostatic** forces all emerge from the same underlying **κζ geometry**:

```
κζ(x,t) = M_τ(x,t) / M_σ(x,t)
```

where:
- **M_τ** (tau moment): Radial/temporal/directional variance → **Gravitational scale**
- **M_σ** (sigma moment): Angular/spatial/spread variance → **Quantum scale**
- **Oscillations in κζ** → **Emergent electrostatic field**

### Key Innovation

Instead of treating different forces as independent, this framework unifies them through geometric anisotropy:

1. **κ (tau) ↔ Gravitational**: Long-range attraction from curvature
2. **σ (sigma) ↔ Quantum**: Stochastic fluctuations and particle creation
3. **∂κζ/∂t ↔ Electrostatic**: Emergent from oscillations in the field

All three forces **coexist** and **interact** via bidirectional coupling with the κζ field.

---

## Architecture

### Component Hierarchy

```
hybrid_particle_system.py (Main Orchestrator)
        │
        ├─── particle_dynamics.py (Core dynamics engine)
        │        ├─ ParticleState
        │        ├─ FociConfiguration
        │        ├─ GravitationalForce (κ-coupled)
        │        ├─ QuantumStochasticForce (σ-coupled)
        │        └─ EmergentElectrostaticForce (oscillation-driven)
        │
        ├─── kappa_zeta_field.py (Spatial field computation)
        │        ├─ SpatialGrid
        │        ├─ KappaZetaField (κζ(x,t) discretization)
        │        └─ BidirectionalCoupler
        │
        ├─── multiscale_physics.py (Force integration)
        │        ├─ MultiScaleForceCalculator
        │        ├─ QuantumParticleInjector
        │        └─ MultiScaleObservables
        │
        ├─── equilibrium_solver.py (Static solutions)
        │        └─ EquilibriumSolver (CGD/GD/L-BFGS)
        │
        └─── particle_visualization.py (Analysis tools)
                 └─ Plotting and animation functions
```

---

## Mathematical Framework

### 1. Polylipse Geometry (n-Focal)

Generalization of ellipse to n focal points:

```
Φ(x) = Σᵢ wᵢ|x - Fᵢ|
```

where `Fᵢ` are focal positions with weights `wᵢ`.

The focal configuration is **solved dynamically** from any observed κζ:

```python
from polylipse_dataset import solve_focal_config

angles, weights = solve_focal_config(n_foci=3, kappa=1.5)
# Automatically finds (θᵢ, wᵢ) that produce κζ ≈ 1.5
```

### 2. Multi-Scale Force Equations

#### Gravitational (κ-coupled):
```
F_grav = -m · ∇(κ(x) · Φ(x))
```

- **Coupling:** M_τ (tau moment)
- **Character:** Long-range, attractive
- **Scale:** Slow, macroscopic

#### Quantum (σ-coupled):
```
F_quantum = ℏ_eff · σ(x) · η(t) / √dt
```

- **Coupling:** M_σ (sigma moment)
- **Character:** Stochastic, random walk
- **Scale:** Fast, microscopic
- **Enables:** Particle creation/annihilation

#### Electrostatic (emergent):
```
∂²κζ/∂t² → ρ(x,ω) → ∇²φ_em = -ρ → F_em = q·E
```

- **Coupling:** Temporal oscillations in κζ
- **Character:** Pairwise, charge-dependent
- **Scale:** Intermediate
- **Emerges from:** Time/space oscillations affecting κ

### 3. Bidirectional Coupling

The system implements **full bidirectional coupling**:

1. **Forward Pass:** κζ field → forces on particles
   ```python
   kappa, sigma = field.get_field_at_positions(particle_positions)
   forces = force_calculator.compute_all_forces(state, kappa, sigma, dt)
   ```

2. **Backward Pass:** particle configuration → update κζ field
   ```python
   field.update_from_particles(
       particle_positions,
       foci_angles,
       foci_centers,
       time=current_time
   )
   ```

This creates a **self-consistent loop** where geometry and dynamics co-evolve.

---

## Quick Start

### Installation

Dependencies:
```bash
pip install torch numpy matplotlib mpmath
```

All files are in `ZetaFormer/`:
- `particle_dynamics.py`
- `kappa_zeta_field.py`
- `multiscale_physics.py`
- `hybrid_particle_system.py`
- `equilibrium_solver.py`
- `particle_visualization.py`
- `demo_particle_physics.py` ← **Start here!**

### Basic Usage

```python
from hybrid_particle_system import create_default_system

# Create system: 3 foci, κζ=1.5, 20 particles
system = create_default_system(
    n_foci=3,
    kappa_target=1.5,
    n_particles=20,
    enable_all_scales=True
)

# Run simulation
summary = system.run(n_steps=100, verbose=True)

# Visualize
from particle_visualization import plot_system_overview
fig = plot_system_overview(system)
```

### Running Demonstrations

The **demo script** showcases all capabilities:

```bash
cd C:\Users\Sar\git\Research\ZetaFormer
python demo_particle_physics.py
```

This will:
1. Run multi-scale dynamics
2. Find equilibrium configurations
3. Analyze scale separation
4. Demonstrate quantum injection
5. Visualize κζ fields

Results saved to `results/` directory.

---

## Core Modules

### 1. `particle_dynamics.py`

**Purpose:** Fundamental particle physics engine.

**Key Classes:**
- `ParticleState`: Complete state (positions, velocities, masses, charges)
- `FociConfiguration`: Focal point setup from κζ
- `FociFieldGenerator`: Compute polylipse potential Φ(x) and ∇Φ
- `GravitationalForce`: κ-coupled long-range attraction
- `QuantumStochasticForce`: σ-coupled random forces
- `EmergentElectrostaticForce`: Oscillation-driven pairwise forces
- `ParticleIntegrator`: Time stepping (Euler, Verlet)

**Example:**
```python
from particle_dynamics import ParticleState, FociConfiguration, GravitationalForce

# Create particles
state = ParticleState(
    positions=torch.randn(10, 2),
    velocities=torch.randn(10, 2) * 0.1,
    masses=torch.ones(10),
    charges=torch.randn(10)
)

# Create foci
foci = FociConfiguration.from_polylipse_config(
    n_foci=3,
    kappa=1.5,
    focal_radius=2.0
)

# Compute forces
from particle_dynamics import FociFieldGenerator
field_gen = FociFieldGenerator(foci)
grav = GravitationalForce(field_gen, coupling_strength=1.0)

kappa_field, _ = field_gen.compute_local_kappa_field(state.positions, state)
F_grav = grav.compute_force(state, kappa_field)
```

### 2. `kappa_zeta_field.py`

**Purpose:** Spatial discretization of κζ(x,t) field.

**Key Classes:**
- `SpatialGrid`: 2D/3D grid for field values
- `KappaZetaField`: Maintains κζ, M_τ, M_σ on grid
- `BidirectionalCoupler`: Orchestrates forward/backward passes

**Features:**
- Kernel density estimation for local moments
- Temporal tracking for oscillation detection
- Inverse distance weighted interpolation
- EMA smoothing for stability

**Example:**
```python
from kappa_zeta_field import SpatialGrid, KappaZetaField, BidirectionalCoupler

# Create grid
grid = SpatialGrid(
    bounds=((-5, 5), (-5, 5)),
    resolution=32,
    n_dim=2
)

# Create field
kz_field = KappaZetaField(grid, bandwidth=0.8)

# Bidirectional coupling
coupler = BidirectionalCoupler(kz_field)

# Update and query
kappa, M_tau, M_sigma = coupler.coupled_step(
    particle_positions,
    foci_angles,
    foci_centers,
    global_M_tau=0.6,
    global_M_sigma=0.4,
    time=0.1
)
```

### 3. `multiscale_physics.py`

**Purpose:** Integrate all three physics scales.

**Key Classes:**
- `MultiScaleParameters`: Coupling strengths for each scale
- `MultiScaleForceCalculator`: Unified force computation
- `QuantumParticleInjector`: Stochastic creation/annihilation
- `MultiScaleObservables`: Energy, momentum, κζ statistics

**Example:**
```python
from multiscale_physics import MultiScaleParameters, MultiScaleForceCalculator

# Configure physics
params = MultiScaleParameters(
    G_grav=1.0,           # Gravitational strength
    hbar_quantum=0.1,     # Quantum noise scale
    k_em=0.05,            # EM coupling
    enable_gravitational=True,
    enable_quantum=True,
    enable_electrostatic=True
)

# Compute all forces
force_calc = MultiScaleForceCalculator(field_gen, params)
total_force, components = force_calc.compute_all_forces(
    state, kappa_field, sigma_field, dt=0.01, separate=True
)

# components = {'gravitational': F_g, 'quantum': F_q, 'electrostatic': F_em}
```

### 4. `hybrid_particle_system.py`

**Purpose:** Main simulation orchestrator.

**Key Classes:**
- `SimulationConfig`: Complete system configuration
- `HybridParticleSystem`: Integrates all components
- `create_default_system()`: Quick setup helper

**Features:**
- Automatic initialization
- History tracking
- Conservation law monitoring
- Quantum injection (optional)
- Comprehensive diagnostics

**Example:**
```python
from hybrid_particle_system import HybridParticleSystem, SimulationConfig
from multiscale_physics import MultiScaleParameters

config = SimulationConfig(
    n_foci=3,
    kappa_target=1.5,
    n_particles_initial=20,
    grid_resolution=32,
    dt=0.01,
    physics_params=MultiScaleParameters(
        enable_gravitational=True,
        enable_quantum=True,
        enable_electrostatic=True
    ),
    enable_bidirectional_coupling=True,
    enable_quantum_injection=False
)

system = HybridParticleSystem(config, seed=42)
summary = system.run(n_steps=100, verbose=True, checkpoint_interval=25)
```

### 5. `equilibrium_solver.py`

**Purpose:** Find static equilibrium configurations.

**Key Classes:**
- `EquilibriumConfig`: Solver parameters
- `EquilibriumSolver`: Optimization engine

**Methods:**
- Gradient Descent with Momentum
- Conjugate Gradient Descent (faster)
- L-BFGS (planned)

**Example:**
```python
from equilibrium_solver import EquilibriumSolver, EquilibriumConfig

# Configure solver
eq_config = EquilibriumConfig(
    max_iterations=500,
    tolerance=1e-5,
    method="cgd"  # Conjugate gradient
)

solver = EquilibriumSolver(foci_config, physics_params, eq_config)

# Find equilibrium from initial guess
equilibrium_state, info = solver.solve(initial_state, verbose=True)

# Find multiple equilibria
equilibria = solver.find_multiple_equilibria(
    n_trials=5,
    n_particles=12,
    seed=42
)
```

### 6. `particle_visualization.py`

**Purpose:** Plotting and animation tools.

**Functions:**
- `plot_particles_and_foci()`: Snapshot with κ coloring
- `plot_kappa_field_heatmap()`: Field visualization
- `plot_trajectory()`: Single particle path
- `plot_energy_evolution()`: Energy and κζ over time
- `plot_force_decomposition()`: Multi-scale breakdown
- `plot_system_overview()`: Comprehensive dashboard
- `create_animation()`: Animated trajectories

**Example:**
```python
from particle_visualization import (
    plot_system_overview,
    plot_kappa_field_heatmap,
    create_animation
)

# Comprehensive overview
fig = plot_system_overview(system)
fig.savefig('overview.png', dpi=150)

# Field heatmap
fig = plot_kappa_field_heatmap(
    system.kappa_zeta_field,
    system.state,
    system.foci_config
)

# Animation
anim = create_animation(
    system.history,
    system.foci_config,
    save_path='trajectory.gif'
)
```

---

## Use Cases

### 1. Physics Simulation

**Goal:** Understand emergent behavior in multi-scale systems.

```python
# Configure with all scales active
system = create_default_system(enable_all_scales=True)
system.run(n_steps=200)

# Analyze observables
from multiscale_physics import MultiScaleObservables
obs = MultiScaleObservables(system.field_generator)

energy = obs.compute_energy(system.state, kappa_field)
momentum = obs.compute_momentum(system.state)
kz_stats = obs.compute_kappa_zeta_statistics(kappa_field, sigma_field)
```

### 2. Training Data Generation

**Goal:** Create physically-valid datasets for neural network training.

```python
# Find equilibria at various κζ values
equilibria = []
for kappa in [0.5, 1.0, 1.5, 2.0, 3.0]:
    foci = FociConfiguration.from_polylipse_config(n_foci=3, kappa=kappa)
    solver = EquilibriumSolver(foci, physics_params, eq_config)
    eq_state, _ = solver.solve(initial_state)
    equilibria.append((kappa, eq_state))

# Save as training dataset
# These configurations naturally satisfy κζ = target
```

### 3. Scale Separation Analysis

**Goal:** Study relative contributions of each physics scale.

```python
results = {}
for scale in ["gravitational", "quantum", "electrostatic"]:
    params = MultiScaleParameters(
        enable_gravitational=(scale == "gravitational"),
        enable_quantum=(scale == "quantum"),
        enable_electrostatic=(scale == "electrostatic")
    )

    config = SimulationConfig(physics_params=params)
    system = HybridParticleSystem(config, seed=42)
    summary = system.run(n_steps=100, verbose=False)

    results[scale] = summary['energy_drift']
```

### 4. Quantum Injection Experiments

**Goal:** Study particle creation/annihilation dynamics.

```python
config = SimulationConfig(
    enable_quantum_injection=True,
    physics_params=MultiScaleParameters(
        hbar_quantum=0.2,  # Higher quantum coupling
        enable_quantum=True
    )
)

system = HybridParticleSystem(config)

# Track particle count evolution
particle_counts = []
for _ in range(200):
    system.step()
    particle_counts.append(system.state.n_particles)
```

---

## Advanced Topics

### Custom Force Implementation

To add a new force:

```python
class MyCustomForce:
    def __init__(self, field_generator, coupling_strength):
        self.field = field_generator
        self.strength = coupling_strength

    def compute_force(self, state, kappa_field):
        # Your force calculation
        positions = state.positions
        forces = torch.zeros_like(positions)

        # Example: harmonic oscillator
        forces = -self.strength * positions

        return forces

# Integrate into MultiScaleForceCalculator
# (Requires modifying multiscale_physics.py)
```

### Custom κζ Field Dynamics

Modify the field update rule:

```python
# In kappa_zeta_field.py, modify KappaZetaField.update_from_particles()

def custom_field_update(self, particle_positions, ...):
    # Your custom dynamics
    # Example: add diffusion term

    kappa_new, M_tau_new, M_sigma_new = self.compute_field_from_particles(...)

    # Laplacian smoothing
    if hasattr(self, 'kappa_field_prev'):
        diffusion = 0.05 * (self.kappa_field_prev - kappa_new)
        kappa_new += diffusion

    self.kappa_field_prev = kappa_new.clone()
    self.kappa_field = kappa_new
```

### Integration with ZetaBlock (Neural Network)

To train a neural network to predict particle dynamics:

```python
# Extend ZetaBlockEnhanced for physics
# See zeta_block_enhanced.py

class ZetaBlockPhysics(ZetaBlockEnhanced):
    def __init__(self, d_model, n_heads, physics_aware=True):
        super().__init__(d_model, n_heads)
        self.physics_aware = physics_aware

    def forward(self, x, particle_state=None):
        # Standard attention
        attn_out, kappa_zeta = super().forward(x)

        if self.physics_aware and particle_state is not None:
            # Modulate by particle field
            kappa_field, _ = compute_local_kappa_field(particle_state.positions)
            attn_out = attn_out * kappa_field[:, None]

        return attn_out, kappa_zeta
```

---

## Testing

Each module includes comprehensive tests. Run:

```python
# Test individual modules
python particle_dynamics.py
python kappa_zeta_field.py
python multiscale_physics.py
python hybrid_particle_system.py
python equilibrium_solver.py
python particle_visualization.py

# Run full demo
python demo_particle_physics.py
```

All tests should pass with output showing:
- ✓ Module functionality verified
- ✓ Force calculations correct
- ✓ Field updates working
- ✓ Conservation laws respected (approximately)
- ✓ Visualizations generated

---

## Performance Notes

### Computational Complexity

| Component | Complexity | Notes |
|-----------|-----------|-------|
| Particle update | O(N) | N = number of particles |
| Field update | O(N × G) | G = grid points |
| Force calculation | O(N²) | For EM pairwise forces |
| Field interpolation | O(N × k) | k = nearest neighbors (~8) |
| Equilibrium solving | O(I × N) | I = iterations (~100-500) |

### Optimization Tips

1. **Reduce grid resolution** for faster field updates (trade accuracy)
2. **Use Verlet integrator** for better energy conservation
3. **Disable stochastic forces** when not needed (quantum, EM)
4. **Batch processing** for multiple simulations
5. **GPU acceleration** via PyTorch (already supported!)

---

## Limitations and Future Work

### Current Limitations

1. **2D/3D only**: Not generalized to arbitrary dimensions
2. **Pairwise EM**: Full Poisson equation solve not implemented
3. **No relativity**: Classical mechanics only
4. **Grid-based field**: Not adaptive mesh refinement

### Planned Extensions

- [ ] Neural network integration (`zeta_block_physics.py`)
- [ ] Physics-informed loss functions (`physics_losses.py`)
- [ ] Training pipeline (`train_particle_physics.py`)
- [ ] 3D visualization and animation
- [ ] Adaptive mesh refinement for field
- [ ] Full Poisson solver for EM forces
- [ ] MPI parallelization for large systems
- [ ] GPU-optimized kernels

---

## Citation

If you use this framework in your research, please cite:

```bibtex
@software{kappa_zeta_particle_physics,
  title={Multi-Scale Particle Physics via κζ Geometric Coupling},
  author={Noetic Eidos Project},
  year={2025},
  url={https://github.com/yourusername/ZetaFormer}
}
```

---

## License

MIT License - See LICENSE file for details.

---

## Support

For questions, issues, or contributions:
- Open an issue on GitHub
- Contact: [Your contact info]

---

## Acknowledgments

This framework builds on:
- **ZetaFormer**: κζ-normalization architecture
- **Polylipse geometry**: n-focal generalization
- **Fisher-Rao manifold**: Information geometry
- **Riemann zeta function**: Critical line convergence

Special thanks to the contributors and the research community for foundational work in information geometry and geometric deep learning.

---

**Status:** Production-ready ✓
**Version:** 1.0
**Last Updated:** 2025-01-08
