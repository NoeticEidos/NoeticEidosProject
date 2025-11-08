# Implementation Roadmap: Advanced Physics Features
## κζ Particle Physics Framework Enhancement Plan

**Version:** 1.0
**Date:** 2025-01-08
**Timeline:** 8 weeks
**Priority Order:** 1 → 3 → 5 → 4 → 2

---

## Executive Summary

This roadmap outlines the implementation of 5 major enhancements to transform the κζ particle physics framework from a working prototype into a high-performance research platform. The features build on the existing integration of 1300+ pre-trained ZetaBlock models with multi-scale physics.

**Key Deliverables:**
1. Physics-informed force predictor using neural attention
2. GPU-optimized kernels for 100x particle scaling
3. Full Poisson solver for accurate electrostatics
4. Interactive 3D visualization platform
5. Automated parameter space exploration tools

---

## Phase 1: Physics-Informed Force Predictor
**Timeline:** Week 1-2
**Effort:** Medium
**Impact:** ⭐⭐⭐⭐⭐ (Highest - Unique capability)

### Overview

Leverage the 1300+ pre-trained ZetaBlock models to create a hybrid physics predictor that combines learned attention patterns with physical constraints. This is a unique opportunity since we have both:
- Pre-trained models that learned κζ geometry representations
- Physics simulation framework to generate ground truth

### Implementation Steps

#### 1.1 Expose Attention Weights in ZetaBlock

**File:** `zeta_block_enhanced.py`

**Current Issue (line 199 in pretrained_integration.py):**
```python
# NOTE: Would need to modify ZetaBlockEnhanced to expose attention weights
```

**Changes Required:**

```python
# In ZetaBlockEnhanced.forward()

class ZetaBlockEnhanced(nn.Module):
    def __init__(self, d_model, n_heads, enable_zeta_norm=True,
                 kappa_strength=0.05, return_attention=False):
        super().__init__()
        self.return_attention = return_attention
        # ... existing init code

    def forward(self, x, return_attention=None):
        """
        Args:
            x: (batch, seq_len, d_model)
            return_attention: Override instance setting

        Returns:
            If return_attention=False:
                output: (batch, seq_len, d_model)
                kappa_zeta: float
            If return_attention=True:
                output: (batch, seq_len, d_model)
                kappa_zeta: float
                attention_weights: (batch, n_heads, seq_len, seq_len)
        """
        return_attn = return_attention if return_attention is not None else self.return_attention

        # ... existing forward pass

        # Before returning, capture attention weights
        if return_attn:
            # Extract from multi-head attention
            attn_weights = self.multihead_attn.get_attention_weights(x)
            return output, kappa_zeta, attn_weights
        else:
            return output, kappa_zeta
```

**Testing:**
```python
# Test attention weight extraction
model = ZetaBlockEnhanced(d_model=32, n_heads=4, return_attention=True)
x = torch.randn(1, 10, 32)
out, kappa, attn = model(x)
assert attn.shape == (1, 4, 10, 10)
```

#### 1.2 Create Physics-Informed Force Prediction Module

**New File:** `physics_informed_predictor.py`

```python
"""
Physics-Informed Force Predictor

Combines learned attention patterns from pre-trained ZetaBlock models
with physical constraints to predict force fields.

Key Features:
- Attention-guided force field estimation
- Physics loss functions (conservation laws)
- Hybrid learned + analytical approach
- Fine-tuning on physics simulation data
"""

import torch
import torch.nn as nn
from typing import Tuple, Optional

from zeta_block_enhanced import ZetaBlockEnhanced
from pretrained_integration import PreTrainedParticlePredictor
from particle_dynamics import ParticleState


class PhysicsInformedForcePredictor(nn.Module):
    """
    Predicts forces using attention weights + physics constraints.

    Architecture:
    1. Encode particle state using pre-trained ZetaBlock
    2. Extract attention weights (particle-particle interactions)
    3. Map attention to force magnitudes using learned head
    4. Apply physics constraints (Newton's 3rd law, conservation)
    5. Output force vectors
    """

    def __init__(
        self,
        pretrained_predictor: PreTrainedParticlePredictor,
        n_dim: int = 2,
        freeze_encoder: bool = True,
        physics_weight: float = 1.0
    ):
        super().__init__()

        self.predictor = pretrained_predictor
        self.n_dim = n_dim
        self.physics_weight = physics_weight

        # Freeze pre-trained encoder if desired
        if freeze_encoder:
            for param in self.predictor.zeta_block.parameters():
                param.requires_grad = False

        # Attention → Force mapping head
        d_model = self.predictor.model_config['d_model']
        n_heads = self.predictor.model_config['n_heads']

        self.force_head = nn.Sequential(
            nn.Linear(n_heads, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, n_dim)
        )

        # Physics constraint layers
        self.constraint_net = nn.Sequential(
            nn.Linear(n_dim, 16),
            nn.Tanh(),
            nn.Linear(16, n_dim)
        )

    def forward(
        self,
        state: ParticleState,
        return_diagnostics: bool = False
    ) -> Tuple[torch.Tensor, Optional[dict]]:
        """
        Predict forces on all particles.

        Args:
            state: Current particle state
            return_diagnostics: Return attention weights and intermediate values

        Returns:
            forces: (n_particles, n_dim) force vectors
            diagnostics: Optional dict with attention, raw forces, etc.
        """
        n_particles = state.n_particles

        # 1. Encode state and get attention
        x = self.predictor.encode_particle_state(state)  # (n_particles, d_model)
        x = x.unsqueeze(0)  # (1, n_particles, d_model)

        # Forward through encoder with attention
        out, kappa_zeta, attention = self.predictor.zeta_block(x, return_attention=True)
        # attention: (1, n_heads, n_particles, n_particles)

        # 2. Compute pairwise forces from attention
        # Average across heads to get interaction strength
        attn_mean = attention[0].mean(dim=0)  # (n_particles, n_particles)

        # Get particle positions and compute direction vectors
        positions = state.positions  # (n_particles, n_dim)
        diff = positions.unsqueeze(0) - positions.unsqueeze(1)  # (n_particles, n_particles, n_dim)
        dist = torch.norm(diff, dim=2, keepdim=True) + 1e-6  # (n_particles, n_particles, 1)
        direction = diff / dist  # Normalized direction vectors

        # Map attention to force magnitudes
        # For each particle i, sum forces from all j
        forces_raw = []
        for i in range(n_particles):
            # Attention from all particles j to particle i
            attn_to_i = attn_mean[:, i].unsqueeze(1)  # (n_particles, 1)

            # Pass through force head
            force_mag = self.force_head(attention[0, :, :, i].t())  # (n_particles, n_dim)

            # Weight by attention and direction
            force_i = (force_mag * direction[:, i, :]).sum(dim=0)  # (n_dim,)
            forces_raw.append(force_i)

        forces_raw = torch.stack(forces_raw)  # (n_particles, n_dim)

        # 3. Apply physics constraints
        forces_constrained = self.apply_physics_constraints(forces_raw, state)

        if return_diagnostics:
            diagnostics = {
                'attention': attention.detach(),
                'forces_raw': forces_raw.detach(),
                'forces_constrained': forces_constrained.detach(),
                'kappa_zeta': kappa_zeta
            }
            return forces_constrained, diagnostics

        return forces_constrained, None

    def apply_physics_constraints(
        self,
        forces: torch.Tensor,
        state: ParticleState
    ) -> torch.Tensor:
        """
        Enforce Newton's 3rd law and momentum conservation.

        Args:
            forces: (n_particles, n_dim) raw predicted forces
            state: Particle state

        Returns:
            constrained_forces: Forces satisfying conservation laws
        """
        # Soft constraint: push toward momentum conservation
        total_force = forces.sum(dim=0)
        correction = -total_force / state.n_particles

        # Apply small correction through learned network
        correction_learned = self.constraint_net(correction)

        # Add correction to all particles
        forces_constrained = forces + correction_learned.unsqueeze(0) * self.physics_weight

        return forces_constrained


class PhysicsLoss(nn.Module):
    """
    Physics-informed loss functions.

    Combines:
    - MSE loss on force predictions
    - Conservation law violations (momentum, energy)
    - Symmetry constraints (Newton's 3rd law)
    """

    def __init__(
        self,
        mse_weight: float = 1.0,
        momentum_weight: float = 0.1,
        energy_weight: float = 0.1
    ):
        super().__init__()
        self.mse_weight = mse_weight
        self.momentum_weight = momentum_weight
        self.energy_weight = energy_weight

    def forward(
        self,
        forces_pred: torch.Tensor,
        forces_true: torch.Tensor,
        state: ParticleState
    ) -> Tuple[torch.Tensor, dict]:
        """
        Compute physics-informed loss.

        Args:
            forces_pred: (n_particles, n_dim) predicted forces
            forces_true: (n_particles, n_dim) ground truth forces
            state: Particle state

        Returns:
            total_loss: Scalar loss
            loss_dict: Individual loss components
        """
        # 1. MSE loss
        mse_loss = torch.nn.functional.mse_loss(forces_pred, forces_true)

        # 2. Momentum conservation
        total_force_pred = forces_pred.sum(dim=0)
        momentum_loss = torch.norm(total_force_pred)

        # 3. Energy conservation (approximate)
        # Check if predicted forces are conservative (curl-free in 2D)
        if state.positions.shape[1] == 2:
            # ∂F_y/∂x - ∂F_x/∂y should be zero for conservative forces
            # Approximate with finite differences
            energy_loss = torch.tensor(0.0, device=forces_pred.device)
        else:
            energy_loss = torch.tensor(0.0, device=forces_pred.device)

        # Total loss
        total_loss = (
            self.mse_weight * mse_loss +
            self.momentum_weight * momentum_loss +
            self.energy_weight * energy_loss
        )

        loss_dict = {
            'mse': mse_loss.item(),
            'momentum': momentum_loss.item(),
            'energy': energy_loss.item(),
            'total': total_loss.item()
        }

        return total_loss, loss_dict
```

#### 1.3 Training Pipeline

**New File:** `train_force_predictor.py`

```python
"""
Training script for physics-informed force predictor.

Workflow:
1. Generate training data using particle physics simulations
2. Train force predictor with physics losses
3. Validate on held-out configurations
4. Save best model checkpoint
"""

import torch
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
import numpy as np

from physics_informed_predictor import PhysicsInformedForcePredictor, PhysicsLoss
from pretrained_integration import PreTrainedParticlePredictor, load_checkpoint_by_kappa
from hybrid_particle_system import create_default_system
from particle_dynamics import ParticleState


class PhysicsDataset(Dataset):
    """Dataset of (particle state, forces) pairs from simulations."""

    def __init__(self, data_dir: str = 'physics_training_data'):
        self.data_dir = Path(data_dir)
        self.samples = list(self.data_dir.glob('sample_*.pt'))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        data = torch.load(self.samples[idx])
        return data['state'], data['forces']


def generate_training_data(
    n_samples: int = 1000,
    kappa_values: list = [1.0, 1.5, 2.0],
    n_particles: int = 20,
    output_dir: str = 'physics_training_data'
):
    """
    Generate training data by running physics simulations.

    Args:
        n_samples: Number of samples to generate
        kappa_values: Range of κζ values to sample
        n_particles: Particles per system
        output_dir: Where to save data
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)

    print(f"Generating {n_samples} training samples...")

    for i in range(n_samples):
        # Random κζ value
        kappa = np.random.choice(kappa_values)
        n_foci = np.random.randint(2, 6)

        # Create system
        system = create_default_system(
            n_foci=n_foci,
            kappa_target=kappa,
            n_particles=n_particles,
            enable_all_scales=True
        )

        # Run for a few steps to get interesting state
        system.run(n_steps=10, verbose=False)

        # Get current state and forces
        state = system.state

        # Compute forces using ground truth physics
        kappa_field, sigma_field = system.field_generator.compute_local_kappa_field(
            state.positions, state
        )
        forces, _ = system.force_calculator.compute_all_forces(
            state, kappa_field, sigma_field, system.config.dt, separate=False
        )

        # Save
        sample_data = {
            'state': state,
            'forces': forces,
            'kappa_zeta': kappa,
            'n_foci': n_foci
        }
        torch.save(sample_data, output_dir / f'sample_{i:05d}.pt')

        if (i + 1) % 100 == 0:
            print(f"  Generated {i + 1}/{n_samples} samples")

    print(f"Training data saved to: {output_dir}")


def train_force_predictor(
    checkpoint_path: str,
    data_dir: str = 'physics_training_data',
    n_epochs: int = 50,
    batch_size: int = 16,
    lr: float = 1e-4,
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
):
    """
    Train physics-informed force predictor.

    Args:
        checkpoint_path: Pre-trained ZetaBlock checkpoint
        data_dir: Training data directory
        n_epochs: Training epochs
        batch_size: Batch size
        lr: Learning rate
        device: Training device
    """
    # Load pre-trained predictor
    pretrained = PreTrainedParticlePredictor(checkpoint_path, device=device)

    # Create force predictor
    model = PhysicsInformedForcePredictor(
        pretrained,
        n_dim=2,
        freeze_encoder=True,  # Keep pre-trained weights frozen
        physics_weight=0.1
    ).to(device)

    # Loss and optimizer
    criterion = PhysicsLoss(mse_weight=1.0, momentum_weight=0.1, energy_weight=0.0)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    # Dataset
    dataset = PhysicsDataset(data_dir)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    print(f"Training force predictor...")
    print(f"  Dataset: {len(dataset)} samples")
    print(f"  Device: {device}")

    best_loss = float('inf')

    for epoch in range(n_epochs):
        model.train()
        epoch_losses = []

        for batch_states, batch_forces in dataloader:
            batch_states = batch_states.to(device)
            batch_forces = batch_forces.to(device)

            # Forward
            forces_pred = []
            for state in batch_states:
                force, _ = model(state)
                forces_pred.append(force)
            forces_pred = torch.stack(forces_pred)

            # Compute loss
            loss, loss_dict = criterion(forces_pred, batch_forces, batch_states[0])

            # Backward
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            epoch_losses.append(loss.item())

        avg_loss = np.mean(epoch_losses)
        print(f"Epoch {epoch+1}/{n_epochs}: Loss = {avg_loss:.6f}")

        # Save best model
        if avg_loss < best_loss:
            best_loss = avg_loss
            torch.save(model.state_dict(), 'force_predictor_best.pt')

    print(f"Training complete! Best loss: {best_loss:.6f}")
    return model


if __name__ == "__main__":
    # Generate training data
    generate_training_data(n_samples=1000)

    # Find a good checkpoint
    ckpt_path = load_checkpoint_by_kappa(1.5, tolerance=0.1)

    # Train
    model = train_force_predictor(ckpt_path)
```

#### 1.4 Integration with Simulation

**Modify:** `hybrid_particle_system.py`

Add option to use learned force predictor:

```python
class SimulationConfig:
    # ... existing fields
    use_learned_forces: bool = False
    force_predictor_path: Optional[str] = None


class HybridParticleSystem:
    def __init__(self, config, seed=42):
        # ... existing init

        if config.use_learned_forces and config.force_predictor_path:
            from physics_informed_predictor import PhysicsInformedForcePredictor
            self.force_predictor = PhysicsInformedForcePredictor.load(
                config.force_predictor_path
            )
        else:
            self.force_predictor = None

    def step(self, ...):
        # ... existing code

        # Option to use learned forces
        if self.force_predictor is not None:
            forces_learned, diagnostics = self.force_predictor(self.state)
            # Optionally blend with physics forces
            total_force = 0.5 * total_force + 0.5 * forces_learned
```

### Testing & Validation

```python
def test_force_predictor():
    """Test force predictor on known configurations."""

    # 1. Test on 2-body problem (analytical solution exists)
    # 2. Test conservation laws
    # 3. Compare learned vs physics forces
    # 4. Benchmark speed improvement

    # Expected: 10-100x speedup for force evaluation
    # Expected: <10% error on force magnitudes
```

### Success Criteria

- ✅ ZetaBlock exposes attention weights
- ✅ Force predictor trains with <0.01 MSE
- ✅ Momentum conserved to <1e-3
- ✅ 10x faster than full physics calculation
- ✅ Accurate predictions on held-out κζ values

---

## Phase 2: GPU Kernel Optimization
**Timeline:** Week 2-3
**Effort:** Low-Medium
**Impact:** ⭐⭐⭐⭐ (Critical for scaling)

### Overview

Replace O(N²) pairwise force calculations with optimized GPU kernels. Currently limited to ~20 particles, goal is 100s-1000s.

### Current Bottlenecks

**File:** `multiscale_physics.py`, line ~150-180

```python
# Current implementation: Explicit nested loops
for i in range(n_particles):
    for j in range(n_particles):
        if i != j:
            r_ij = positions[j] - positions[i]
            dist = torch.norm(r_ij) + 1e-6
            force_ij = charges[i] * charges[j] * r_ij / (dist**3)
            forces[i] += force_ij
```

**Problem:** O(N²) complexity, CPU-bound loops

### Implementation

**New File:** `gpu_kernels.py`

```python
"""
Optimized GPU kernels for particle physics calculations.

Implements:
- Vectorized pairwise force computation
- Batch processing for multiple systems
- Memory-efficient algorithms
- Custom CUDA kernels (optional)
"""

import torch
import torch.nn.functional as F


def compute_pairwise_forces_vectorized(
    positions: torch.Tensor,
    charges: torch.Tensor,
    masses: torch.Tensor,
    epsilon: float = 1e-6
) -> torch.Tensor:
    """
    Compute all pairwise electrostatic forces using vectorized operations.

    Args:
        positions: (n_particles, n_dim)
        charges: (n_particles,)
        masses: (n_particles,)
        epsilon: Softening parameter

    Returns:
        forces: (n_particles, n_dim)

    Complexity: O(N²) but fully GPU-accelerated
    Memory: O(N²) for distance matrix
    """
    n_particles = positions.shape[0]
    n_dim = positions.shape[1]

    # Compute all pairwise differences: r_ij = r_j - r_i
    # Broadcasting: (n, 1, dim) - (1, n, dim) = (n, n, dim)
    r_ij = positions.unsqueeze(0) - positions.unsqueeze(1)  # (n, n, dim)

    # Distances
    dist_sq = torch.sum(r_ij**2, dim=2) + epsilon  # (n, n)
    dist = torch.sqrt(dist_sq)  # (n, n)

    # Direction vectors
    direction = r_ij / dist.unsqueeze(2)  # (n, n, dim)

    # Force magnitudes: F = k * q_i * q_j / r_ij^2
    q_products = charges.unsqueeze(0) * charges.unsqueeze(1)  # (n, n)
    force_mag = q_products / dist_sq  # (n, n)

    # Force vectors
    forces = force_mag.unsqueeze(2) * direction  # (n, n, dim)

    # Sum forces on each particle (exclude self-interaction)
    mask = ~torch.eye(n_particles, dtype=torch.bool, device=positions.device)
    forces_total = (forces * mask.unsqueeze(2)).sum(dim=1)  # (n, dim)

    return forces_total


def compute_pairwise_forces_chunked(
    positions: torch.Tensor,
    charges: torch.Tensor,
    masses: torch.Tensor,
    chunk_size: int = 256,
    epsilon: float = 1e-6
) -> torch.Tensor:
    """
    Memory-efficient chunked computation for large N.

    For N > 1000, the O(N²) distance matrix doesn't fit in GPU memory.
    Process in chunks to trade compute for memory.

    Args:
        positions: (n_particles, n_dim)
        charges: (n_particles,)
        masses: (n_particles,)
        chunk_size: Process this many particles at once
        epsilon: Softening parameter

    Returns:
        forces: (n_particles, n_dim)
    """
    n_particles = positions.shape[0]
    n_dim = positions.shape[1]
    device = positions.device

    forces_total = torch.zeros(n_particles, n_dim, device=device)

    # Process in chunks
    for i_start in range(0, n_particles, chunk_size):
        i_end = min(i_start + chunk_size, n_particles)

        # Chunk of target particles
        pos_i = positions[i_start:i_end]  # (chunk, dim)
        q_i = charges[i_start:i_end]  # (chunk,)

        # Compute forces from all source particles
        for j_start in range(0, n_particles, chunk_size):
            j_end = min(j_start + chunk_size, n_particles)

            pos_j = positions[j_start:j_end]  # (chunk, dim)
            q_j = charges[j_start:j_end]  # (chunk,)

            # Pairwise distances in this chunk
            r_ij = pos_j.unsqueeze(0) - pos_i.unsqueeze(1)  # (chunk_i, chunk_j, dim)
            dist_sq = torch.sum(r_ij**2, dim=2) + epsilon
            dist = torch.sqrt(dist_sq)

            # Forces
            q_products = q_i.unsqueeze(1) * q_j.unsqueeze(0)
            force_mag = q_products / dist_sq
            direction = r_ij / dist.unsqueeze(2)
            forces_chunk = force_mag.unsqueeze(2) * direction

            # Accumulate (exclude self)
            if i_start <= j_start < i_end or j_start <= i_start < j_end:
                # Overlapping chunks - mask self-interaction
                for k in range(i_end - i_start):
                    for l in range(j_end - j_start):
                        if i_start + k == j_start + l:
                            forces_chunk[k, l] = 0

            forces_total[i_start:i_end] += forces_chunk.sum(dim=1)

    return forces_total


def compute_forces_batch(
    positions_batch: torch.Tensor,
    charges_batch: torch.Tensor,
    masses_batch: torch.Tensor,
    epsilon: float = 1e-6
) -> torch.Tensor:
    """
    Batch processing for multiple independent systems.

    Args:
        positions_batch: (batch, n_particles, n_dim)
        charges_batch: (batch, n_particles)
        masses_batch: (batch, n_particles)

    Returns:
        forces_batch: (batch, n_particles, n_dim)
    """
    batch_size = positions_batch.shape[0]
    n_particles = positions_batch.shape[1]
    n_dim = positions_batch.shape[2]

    # Vectorized across batch dimension
    r_ij = positions_batch.unsqueeze(2) - positions_batch.unsqueeze(1)  # (B, n, n, dim)
    dist_sq = torch.sum(r_ij**2, dim=3) + epsilon
    dist = torch.sqrt(dist_sq)

    direction = r_ij / dist.unsqueeze(3)
    q_products = charges_batch.unsqueeze(2) * charges_batch.unsqueeze(1)
    force_mag = q_products / dist_sq
    forces = force_mag.unsqueeze(3) * direction

    # Mask self-interaction
    mask = ~torch.eye(n_particles, dtype=torch.bool, device=positions_batch.device)
    mask = mask.unsqueeze(0).unsqueeze(3)  # (1, n, n, 1)

    forces_total = (forces * mask).sum(dim=2)  # (B, n, dim)

    return forces_total


# Optional: Custom CUDA kernel for maximum performance
try:
    from torch.utils.cpp_extension import load_inline

    cuda_source = """
    __global__ void pairwise_forces_kernel(
        const float* positions,
        const float* charges,
        float* forces,
        int n_particles,
        int n_dim,
        float epsilon
    ) {
        int i = blockIdx.x * blockDim.x + threadIdx.x;
        if (i >= n_particles) return;

        float force[3] = {0.0f, 0.0f, 0.0f};

        for (int j = 0; j < n_particles; j++) {
            if (i == j) continue;

            // Compute r_ij
            float r_ij[3];
            float dist_sq = epsilon;
            for (int d = 0; d < n_dim; d++) {
                r_ij[d] = positions[j * n_dim + d] - positions[i * n_dim + d];
                dist_sq += r_ij[d] * r_ij[d];
            }

            float dist = sqrtf(dist_sq);
            float force_mag = charges[i] * charges[j] / dist_sq;

            for (int d = 0; d < n_dim; d++) {
                force[d] += force_mag * r_ij[d] / dist;
            }
        }

        for (int d = 0; d < n_dim; d++) {
            forces[i * n_dim + d] = force[d];
        }
    }
    """

    # This would be compiled at runtime if CUDA available
    CUDA_AVAILABLE = True
except:
    CUDA_AVAILABLE = False


class GPUForceCalculator:
    """Intelligent force calculator that chooses best method."""

    def __init__(self, device='cuda'):
        self.device = device
        self.cuda_available = CUDA_AVAILABLE and 'cuda' in device

    def compute_forces(
        self,
        positions: torch.Tensor,
        charges: torch.Tensor,
        masses: torch.Tensor,
        method: str = 'auto'
    ) -> torch.Tensor:
        """
        Compute forces using best available method.

        Args:
            positions: (n_particles, n_dim)
            charges: (n_particles,)
            masses: (n_particles,)
            method: 'auto', 'vectorized', 'chunked', 'cuda'

        Returns:
            forces: (n_particles, n_dim)
        """
        n_particles = positions.shape[0]

        # Auto-select method
        if method == 'auto':
            if n_particles < 100:
                method = 'vectorized'
            elif n_particles < 1000:
                method = 'vectorized' if positions.device.type == 'cuda' else 'chunked'
            else:
                method = 'chunked'

        if method == 'vectorized':
            return compute_pairwise_forces_vectorized(positions, charges, masses)
        elif method == 'chunked':
            return compute_pairwise_forces_chunked(positions, charges, masses)
        elif method == 'cuda' and self.cuda_available:
            # Call custom CUDA kernel
            return self._compute_cuda(positions, charges, masses)
        else:
            raise ValueError(f"Unknown method: {method}")

    def _compute_cuda(self, positions, charges, masses):
        # Custom CUDA kernel implementation
        raise NotImplementedError("Custom CUDA kernel not yet implemented")
```

### Integration

**Modify:** `multiscale_physics.py`

```python
from gpu_kernels import GPUForceCalculator

class EmergentElectrostaticForce:
    def __init__(self, ...):
        # ... existing init
        self.gpu_calculator = GPUForceCalculator(device='cuda' if torch.cuda.is_available() else 'cpu')

    def compute_force(self, state, kappa_field):
        # Replace nested loops with GPU kernel
        forces = self.gpu_calculator.compute_forces(
            state.positions,
            state.charges,
            state.masses
        )
        return forces
```

### Benchmarking

**New File:** `benchmark_gpu_kernels.py`

```python
"""Benchmark GPU optimization speedup."""

import torch
import time
import matplotlib.pyplot as plt

from gpu_kernels import compute_pairwise_forces_vectorized, compute_pairwise_forces_chunked


def benchmark_scaling():
    """Test performance across particle counts."""

    particle_counts = [10, 20, 50, 100, 200, 500, 1000, 2000]
    times_vectorized = []
    times_chunked = []

    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    for n in particle_counts:
        positions = torch.randn(n, 2, device=device)
        charges = torch.randn(n, device=device)
        masses = torch.ones(n, device=device)

        # Vectorized
        if n <= 1000:  # Memory limit
            start = time.time()
            for _ in range(10):
                forces = compute_pairwise_forces_vectorized(positions, charges, masses)
            torch.cuda.synchronize() if device == 'cuda' else None
            elapsed = (time.time() - start) / 10
            times_vectorized.append(elapsed)
        else:
            times_vectorized.append(None)

        # Chunked
        start = time.time()
        for _ in range(10):
            forces = compute_pairwise_forces_chunked(positions, charges, masses, chunk_size=256)
        torch.cuda.synchronize() if device == 'cuda' else None
        elapsed = (time.time() - start) / 10
        times_chunked.append(elapsed)

        print(f"N={n:4d}: vectorized={times_vectorized[-1] if times_vectorized[-1] else 'OOM':>8s}, chunked={elapsed:.6f}s")

    # Plot
    plt.figure(figsize=(10, 6))
    valid_vec = [(n, t) for n, t in zip(particle_counts, times_vectorized) if t is not None]
    if valid_vec:
        plt.plot([n for n, _ in valid_vec], [t for _, t in valid_vec], 'o-', label='Vectorized')
    plt.plot(particle_counts, times_chunked, 's-', label='Chunked')
    plt.xlabel('Number of Particles')
    plt.ylabel('Time per Step (s)')
    plt.title(f'GPU Kernel Performance ({device})')
    plt.legend()
    plt.grid(True)
    plt.loglog()
    plt.savefig('gpu_benchmark.png', dpi=150)
    print("\nBenchmark plot saved: gpu_benchmark.png")


if __name__ == "__main__":
    benchmark_scaling()
```

### Success Criteria

- ✅ 10x speedup for N=100 particles
- ✅ Support N=1000+ particles
- ✅ <1% error vs original implementation
- ✅ Memory usage scales sub-quadratically

---

## Phase 3: Full Poisson Solver
**Timeline:** Week 3-5
**Effort:** Medium-High
**Impact:** ⭐⭐⭐⭐ (Accuracy + realism)

### Overview

Upgrade electrostatics from pairwise Coulomb to full field-based solution of Poisson's equation: ∇²φ = -ρ/ε₀

**Benefits:**
- More accurate physics
- Handles boundary conditions
- Enables complex geometries
- Scales better than O(N²)

### Implementation

**New File:** `poisson_solver.py`

```python
"""
Full Poisson Solver for Electrostatics

Solves ∇²φ = -ρ/ε₀ on a grid using FFT-based methods.

Methods:
- Spectral (FFT) solver for periodic boundaries
- Multigrid for Dirichlet boundaries
- Adaptive mesh refinement
"""

import torch
import numpy as np
from typing import Tuple, Optional


class PoissonSolverFFT:
    """
    FFT-based Poisson solver for periodic boundaries.

    Solves: ∇²φ = -ρ

    Method:
    1. FFT of charge density: ρ̂ = FFT(ρ)
    2. Solve in Fourier space: φ̂ = -ρ̂ / k²
    3. Inverse FFT: φ = IFFT(φ̂)
    4. Compute E-field: E = -∇φ
    """

    def __init__(
        self,
        grid_size: Tuple[int, ...],
        domain_size: Tuple[float, ...],
        epsilon_0: float = 1.0,
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    ):
        """
        Args:
            grid_size: (nx, ny) or (nx, ny, nz)
            domain_size: (Lx, Ly) or (Lx, Ly, Lz) physical size
            epsilon_0: Permittivity
            device: Compute device
        """
        self.grid_size = grid_size
        self.domain_size = domain_size
        self.epsilon_0 = epsilon_0
        self.device = device
        self.n_dim = len(grid_size)

        # Grid spacing
        self.dx = [L / (n - 1) for L, n in zip(domain_size, grid_size)]

        # Construct k-space grid
        self.k_grid = self._build_k_grid()

    def _build_k_grid(self) -> torch.Tensor:
        """
        Build wavenumber grid for FFT.

        Returns:
            k_squared: (nx, ny) or (nx, ny, nz) with k² values
        """
        k_grids = []
        for i, (n, L) in enumerate(zip(self.grid_size, self.domain_size)):
            # Frequency grid
            k = torch.fft.fftfreq(n, d=L/n, device=self.device) * 2 * np.pi
            k_grids.append(k)

        # Create meshgrid
        if self.n_dim == 2:
            kx, ky = torch.meshgrid(k_grids[0], k_grids[1], indexing='ij')
            k_squared = kx**2 + ky**2
        elif self.n_dim == 3:
            kx, ky, kz = torch.meshgrid(k_grids[0], k_grids[1], k_grids[2], indexing='ij')
            k_squared = kx**2 + ky**2 + kz**2
        else:
            raise ValueError("Only 2D and 3D supported")

        # Avoid division by zero at k=0
        k_squared[0, 0] = 1.0  # Will be set to zero potential later

        return k_squared

    def solve(
        self,
        charge_density: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Solve Poisson equation for given charge density.

        Args:
            charge_density: (nx, ny) or (nx, ny, nz) charge density ρ(x)

        Returns:
            potential: (nx, ny) or (nx, ny, nz) electric potential φ(x)
            electric_field: (nx, ny, 2) or (nx, ny, nz, 3) E-field E(x)
        """
        # FFT of charge density
        rho_hat = torch.fft.fftn(charge_density)

        # Solve in Fourier space: φ̂ = -ρ̂ / (ε₀ k²)
        phi_hat = -rho_hat / (self.epsilon_0 * self.k_grid)

        # Set DC component to zero (mean potential = 0)
        phi_hat[0, 0] = 0

        # Inverse FFT
        potential = torch.fft.ifftn(phi_hat).real

        # Compute electric field: E = -∇φ
        electric_field = self._compute_gradient(potential)

        return potential, electric_field

    def _compute_gradient(self, field: torch.Tensor) -> torch.Tensor:
        """
        Compute gradient using spectral differentiation.

        Args:
            field: (nx, ny) or (nx, ny, nz) scalar field

        Returns:
            gradient: (nx, ny, 2) or (nx, ny, nz, 3) vector field
        """
        field_hat = torch.fft.fftn(field)

        # Get frequency grids
        k_grids = []
        for i, (n, L) in enumerate(zip(self.grid_size, self.domain_size)):
            k = torch.fft.fftfreq(n, d=L/n, device=self.device) * 2 * np.pi
            k_grids.append(k)

        gradients = []
        for i, k in enumerate(k_grids):
            # Reshape k for broadcasting
            shape = [1] * self.n_dim
            shape[i] = len(k)
            k_reshaped = k.reshape(shape)

            # Spectral derivative: ∂/∂x_i → 1j * k_i
            deriv_hat = 1j * k_reshaped * field_hat
            deriv = torch.fft.ifftn(deriv_hat).real
            gradients.append(deriv)

        # Stack into vector field
        gradient = torch.stack(gradients, dim=-1)

        return -gradient  # E = -∇φ

    def deposit_charges(
        self,
        positions: torch.Tensor,
        charges: torch.Tensor
    ) -> torch.Tensor:
        """
        Deposit point charges onto grid using cloud-in-cell (CIC) method.

        Args:
            positions: (n_particles, n_dim) particle positions
            charges: (n_particles,) particle charges

        Returns:
            charge_density: (nx, ny) or (nx, ny, nz) gridded charge density
        """
        charge_density = torch.zeros(self.grid_size, device=self.device)

        # Convert positions to grid indices
        grid_pos = []
        for i, (pos_i, L, n) in enumerate(zip(positions.t(), self.domain_size, self.grid_size)):
            # Wrap to periodic domain
            pos_wrapped = pos_i % L
            # Convert to grid index
            idx = pos_wrapped / L * (n - 1)
            grid_pos.append(idx)
        grid_pos = torch.stack(grid_pos, dim=1)  # (n_particles, n_dim)

        # Cloud-in-cell deposition
        for p in range(positions.shape[0]):
            q = charges[p]

            # Get integer and fractional parts
            idx_low = torch.floor(grid_pos[p]).long()
            idx_high = idx_low + 1
            frac = grid_pos[p] - idx_low.float()

            # Periodic wrap
            idx_low = idx_low % torch.tensor(self.grid_size, device=self.device)
            idx_high = idx_high % torch.tensor(self.grid_size, device=self.device)

            # Bilinear/trilinear interpolation weights
            if self.n_dim == 2:
                wx0, wy0 = 1 - frac[0], 1 - frac[1]
                wx1, wy1 = frac[0], frac[1]

                charge_density[idx_low[0], idx_low[1]] += q * wx0 * wy0
                charge_density[idx_high[0], idx_low[1]] += q * wx1 * wy0
                charge_density[idx_low[0], idx_high[1]] += q * wx0 * wy1
                charge_density[idx_high[0], idx_high[1]] += q * wx1 * wy1

            elif self.n_dim == 3:
                wx0, wy0, wz0 = 1 - frac
                wx1, wy1, wz1 = frac

                charge_density[idx_low[0], idx_low[1], idx_low[2]] += q * wx0 * wy0 * wz0
                charge_density[idx_high[0], idx_low[1], idx_low[2]] += q * wx1 * wy0 * wz0
                # ... (8 corners for 3D)

        # Normalize by cell volume
        cell_volume = np.prod(self.dx)
        charge_density /= cell_volume

        return charge_density

    def interpolate_field(
        self,
        field: torch.Tensor,
        positions: torch.Tensor
    ) -> torch.Tensor:
        """
        Interpolate field values at particle positions.

        Args:
            field: (nx, ny, n_dim) or (nx, ny, nz, n_dim) vector field on grid
            positions: (n_particles, n_dim) query positions

        Returns:
            field_at_positions: (n_particles, n_dim) interpolated field
        """
        # Use torch.grid_sample for efficient interpolation
        # (Implementation details...)
        raise NotImplementedError("Field interpolation not yet implemented")


class ElectrostaticFieldSolver:
    """
    High-level interface for solving electrostatics with particles.

    Workflow:
    1. Deposit charges onto grid
    2. Solve Poisson equation
    3. Interpolate E-field back to particles
    4. Compute forces: F = q * E
    """

    def __init__(
        self,
        grid_size: Tuple[int, ...] = (64, 64),
        domain_size: Tuple[float, ...] = (10.0, 10.0),
        epsilon_0: float = 1.0,
        device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    ):
        self.solver = PoissonSolverFFT(grid_size, domain_size, epsilon_0, device)

    def compute_forces(
        self,
        positions: torch.Tensor,
        charges: torch.Tensor
    ) -> torch.Tensor:
        """
        Compute electrostatic forces on all particles.

        Args:
            positions: (n_particles, n_dim)
            charges: (n_particles,)

        Returns:
            forces: (n_particles, n_dim)
        """
        # 1. Deposit charges
        rho = self.solver.deposit_charges(positions, charges)

        # 2. Solve Poisson equation
        phi, E_field = self.solver.solve(rho)

        # 3. Interpolate E-field to particle positions
        E_at_particles = self.solver.interpolate_field(E_field, positions)

        # 4. Compute forces
        forces = charges.unsqueeze(1) * E_at_particles

        return forces
```

### Integration & Testing

```python
# Modify multiscale_physics.py
class EmergentElectrostaticForce:
    def __init__(self, use_poisson=True, grid_size=(64, 64)):
        if use_poisson:
            from poisson_solver import ElectrostaticFieldSolver
            self.field_solver = ElectrostaticFieldSolver(grid_size=grid_size)
        else:
            self.field_solver = None  # Use pairwise

    def compute_force(self, state, kappa_field):
        if self.field_solver:
            return self.field_solver.compute_forces(state.positions, state.charges)
        else:
            # Original pairwise implementation
            return self._compute_pairwise(state)
```

### Success Criteria

- ✅ Correct solution for point charge (compare to analytical)
- ✅ Energy conserved with <1e-4 error
- ✅ Faster than pairwise for N>100
- ✅ Handles boundary conditions correctly

---

## Phase 4: Interactive 3D Visualization
**Timeline:** Week 5-6
**Effort:** Medium
**Impact:** ⭐⭐⭐ (Accessibility + exploration)

### Overview

Create interactive 3D visualization tools using Plotly for real-time exploration of particle dynamics and κζ fields.

### Implementation

**New File:** `interactive_viz.py`

```python
"""
Interactive 3D Visualization using Plotly

Features:
- 3D particle trajectories
- Real-time parameter sliders
- κζ field isosurfaces
- Animation controls
- Export to HTML
"""

import plotly.graph_objects as go
from plotly.subplots import make_subplots
import numpy as np
import torch


def create_3d_particle_plot(
    positions_history: list,
    foci_centers: torch.Tensor,
    title: str = "Particle Trajectories"
):
    """
    Create interactive 3D plot of particle trajectories.

    Args:
        positions_history: List of (n_particles, 3) position arrays over time
        foci_centers: (n_foci, 3) focal point positions
        title: Plot title

    Returns:
        fig: Plotly figure object
    """
    fig = go.Figure()

    # Add foci as large markers
    fig.add_trace(go.Scatter3d(
        x=foci_centers[:, 0].cpu().numpy(),
        y=foci_centers[:, 1].cpu().numpy(),
        z=foci_centers[:, 2].cpu().numpy() if foci_centers.shape[1] == 3 else np.zeros(len(foci_centers)),
        mode='markers',
        marker=dict(size=15, color='red', symbol='diamond'),
        name='Foci'
    ))

    # Add particle trajectories
    n_particles = positions_history[0].shape[0]
    for i in range(n_particles):
        trajectory = np.array([pos[i].cpu().numpy() for pos in positions_history])

        fig.add_trace(go.Scatter3d(
            x=trajectory[:, 0],
            y=trajectory[:, 1],
            z=trajectory[:, 2] if trajectory.shape[1] == 3 else np.zeros(len(trajectory)),
            mode='lines+markers',
            marker=dict(size=3),
            line=dict(width=2),
            name=f'Particle {i}',
            showlegend=i < 5  # Only show first 5 in legend
        ))

    # Layout
    fig.update_layout(
        title=title,
        scene=dict(
            xaxis_title='X',
            yaxis_title='Y',
            zaxis_title='Z',
            aspectmode='cube'
        ),
        width=1000,
        height=800
    )

    return fig


def create_animated_system(
    system_history: list,
    kappa_history: list = None
):
    """
    Create animated visualization with sliders.

    Args:
        system_history: List of system states over time
        kappa_history: Optional κζ field evolution

    Returns:
        fig: Animated plotly figure
    """
    # Implementation with frames and animation controls
    # ...
    pass


def create_kappa_field_isosurface(
    kappa_field,
    threshold: float = 1.5
):
    """
    Create 3D isosurface of κζ field.

    Args:
        kappa_field: 3D grid of κζ values
        threshold: Isosurface value

    Returns:
        fig: Plotly figure with isosurface
    """
    # Use marching cubes or Plotly's isosurface
    # ...
    pass
```

### Success Criteria

- ✅ 3D trajectory visualization
- ✅ Interactive parameter controls
- ✅ Export to standalone HTML
- ✅ Smooth animation (>30 FPS)

---

## Phase 5: Parameter Space Explorer
**Timeline:** Week 6-8
**Effort:** Medium
**Impact:** ⭐⭐⭐⭐ (Scientific discovery)

### Overview

Systematically explore physics behavior across all 1378 checkpoints to generate κζ-phase diagrams and discover emergent patterns.

### Implementation

**New File:** `parameter_explorer.py`

```python
"""
Automated Parameter Space Exploration

Batch processes all checkpoints to:
- Find equilibria at each κζ
- Compute phase diagrams
- Identify transitions
- Generate equilibrium database
"""

import torch
import numpy as np
import pandas as pd
from pathlib import Path
from tqdm import tqdm
import multiprocessing as mp

from pretrained_integration import load_checkpoint_by_kappa
from hybrid_particle_system import create_default_system
from equilibrium_solver import EquilibriumSolver


class ParameterSpaceExplorer:
    """Systematically explore κζ parameter space."""

    def __init__(
        self,
        checkpoint_dir: str = 'polylipse_curriculum_results',
        output_dir: str = 'parameter_exploration'
    ):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

        # Load all checkpoints
        self.checkpoints = list(self.checkpoint_dir.glob('level_*_checkpoint.pt'))
        print(f"Found {len(self.checkpoints)} checkpoints")

    def explore_all(self, n_particles: int = 20, parallel: bool = True):
        """
        Run physics simulations for all checkpoints.

        Args:
            n_particles: Particles per simulation
            parallel: Use multiprocessing
        """
        if parallel:
            with mp.Pool() as pool:
                results = pool.map(self._explore_single, self.checkpoints)
        else:
            results = [self._explore_single(ckpt) for ckpt in tqdm(self.checkpoints)]

        # Compile results
        df = pd.DataFrame(results)
        df.to_csv(self.output_dir / 'exploration_results.csv', index=False)

        return df

    def _explore_single(self, checkpoint_path):
        """Explore single checkpoint."""
        # Load checkpoint info
        ckpt = torch.load(checkpoint_path, map_location='cpu')

        # ... run simulations, find equilibria, compute metrics

        return {
            'checkpoint': checkpoint_path.name,
            'kappa_zeta': kappa,
            # ... other metrics
        }
```

### Success Criteria

- ✅ Process all 1378 checkpoints
- ✅ Generate phase diagram
- ✅ Identify bifurcations
- ✅ Create equilibrium database

---

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Phase 1 Start | Attention weight extraction |
| 2 | Phase 1 + 2 | Force predictor + GPU kernels |
| 3 | Phase 2 + 3 Start | Benchmarks + Poisson solver |
| 4 | Phase 3 | Poisson validation |
| 5 | Phase 3 + 4 Start | Integration + 3D viz |
| 6 | Phase 4 + 5 Start | Interactive tools + Explorer |
| 7 | Phase 5 | Batch processing |
| 8 | Phase 5 | Phase diagrams + Final docs |

---

## Success Metrics

### Performance
- ✅ 100x particle scaling (20 → 2000)
- ✅ 10x force evaluation speedup
- ✅ <1% physics error

### Capabilities
- ✅ Physics-informed force prediction
- ✅ Accurate field-based EM
- ✅ Interactive 3D exploration
- ✅ Complete parameter space map

### Scientific Output
- ✅ κζ-phase diagram
- ✅ Equilibrium database
- ✅ Bifurcation catalog
- ✅ 5+ figures for publication

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| GPU memory limits | Chunked computation |
| Numerical instability | Adaptive time stepping |
| Slow training | Transfer learning |
| Integration bugs | Comprehensive tests |

---

## Dependencies

```
# Core
torch >= 2.0
numpy >= 1.24
scipy >= 1.10

# Visualization
plotly >= 5.14
matplotlib >= 3.7

# Analysis
pandas >= 2.0
scikit-learn >= 1.3

# Optional (performance)
cupy >= 12.0  # CUDA acceleration
```

---

## Next Actions

1. **Read this roadmap** ✓
2. **Approve plan** (you are here)
3. **Create tracking issue** for each phase
4. **Begin Phase 1** implementation
5. **Weekly progress reviews**

---

**Document Version:** 1.0
**Last Updated:** 2025-01-08
**Status:** Ready for Implementation
