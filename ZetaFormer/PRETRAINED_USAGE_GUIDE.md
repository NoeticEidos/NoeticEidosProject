# Using Pre-Trained Weights with Particle Physics

## Overview

You have **1300+ pre-trained ZetaBlock checkpoints** from curriculum learning! These models have learned representations of κζ geometry across different focal configurations.

**Location:** `polylipse_curriculum_results/level_*_checkpoint.pt`

---

## Quick Start

### 1. Load a Specific Checkpoint

```python
from pretrained_integration import PreTrainedParticlePredictor

# Load checkpoint from level 1000
predictor = PreTrainedParticlePredictor(
    'polylipse_curriculum_results/level_1000_checkpoint.pt'
)

# Check what κζ it was trained on
print(f"Trained on κζ = {predictor.get_curriculum_kappa():.4f}")
```

### 2. Find Checkpoint by κζ Value

```python
from pretrained_integration import load_checkpoint_by_kappa

# Find checkpoint closest to κζ=1.5
checkpoint_path = load_checkpoint_by_kappa(
    target_kappa=1.5,
    tolerance=0.05  # Accept within ±0.05
)

if checkpoint_path:
    predictor = PreTrainedParticlePredictor(checkpoint_path)
    print(f"Found model trained on κζ = {predictor.get_curriculum_kappa():.4f}")
```

### 3. Create Physics System from Checkpoint

```python
from pretrained_integration import create_physics_system_from_checkpoint

# Create system initialized with learned geometry
system, predictor = create_physics_system_from_checkpoint(
    checkpoint_path='polylipse_curriculum_results/level_1000_checkpoint.pt',
    n_particles=20,
    enable_physics=True  # Enable all physics scales
)

# Run simulation
summary = system.run(n_steps=100, verbose=True)
```

---

## What's in a Checkpoint?

Each `.pt` file contains:

```python
checkpoint = {
    'model_config': {
        'd_model': 32,           # Embedding dimension
        'n_heads': 4,            # Attention heads
        'enable_zeta_norm': True,
        'kappa_strength': 0.05
    },

    'model_state_dict': {...},    # Trained weights
    'classifier_state_dict': {...},
    'optimizer_state_dict': {...},

    'curriculum_info': {
        'level': 1000,             # Curriculum level
        'kappa_zeta': 1.523,       # κζ value
        'n_foci': 3,               # Number of foci
        'stabilized': True
    },

    'dataset_config': {
        'n_foci': 3,
        'focal_radius': 2.0,
        ...
    },

    'metrics': {
        'final_loss': 0.123,
        'accuracy': 0.95,
        ...
    }
}
```

---

## Use Cases

### A. Generate Physically-Valid Initial Configurations

The pre-trained model has learned stable particle arrangements. Use it to initialize simulations:

```python
from pretrained_integration import PreTrainedParticlePredictor
from particle_dynamics import FociConfiguration

predictor = PreTrainedParticlePredictor('path/to/checkpoint.pt')

# Create foci
foci_config = FociConfiguration.from_polylipse_config(
    n_foci=3,
    kappa=1.5,
    focal_radius=2.0
)

# Generate learned configuration
learned_state = predictor.predict_particle_configuration(
    foci_config,
    n_particles=20
)

# Use in simulation
from hybrid_particle_system import HybridParticleSystem, SimulationConfig

config = SimulationConfig(n_foci=3, kappa_target=1.5)
system = HybridParticleSystem(config)
system.state = learned_state  # Use learned initialization
```

### B. Predict Interaction Patterns

Use learned attention to understand particle-particle relationships:

```python
# Get attention weights
attention_weights, kappa_zeta = predictor.predict_attention_weights(state)

# attention_weights: (n_particles, n_particles) matrix
# High values = strong learned interaction

import matplotlib.pyplot as plt
plt.imshow(attention_weights.numpy(), cmap='hot')
plt.title('Learned Particle Interactions')
plt.colorbar()
```

### C. Transfer Learning Across κζ Levels

Train on one κζ, transfer to another:

```python
# Load model trained on κζ=1.5
predictor_15 = PreTrainedParticlePredictor(
    load_checkpoint_by_kappa(1.5)
)

# Use it to initialize simulation at κζ=2.0
from hybrid_particle_system import SimulationConfig, HybridParticleSystem
from multiscale_physics import MultiScaleParameters

config = SimulationConfig(
    n_foci=3,
    kappa_target=2.0,  # Different κζ!
    physics_params=MultiScaleParameters(
        enable_gravitational=True,
        enable_quantum=True,
        enable_electrostatic=True
    )
)

system = HybridParticleSystem(config)

# Initialize with κζ=1.5 learned config, let it adapt to κζ=2.0
learned_state = predictor_15.predict_particle_configuration(
    system.foci_config,
    n_particles=20
)
system.state = learned_state

# Run - particles will adapt to new κζ
system.run(n_steps=200)
```

### D. Compare Learned vs Physics-Based Evolution

```python
# Create two systems: one learned, one random
system_learned, predictor = create_physics_system_from_checkpoint(
    checkpoint_path,
    n_particles=20
)

system_random = create_default_system(
    n_foci=3,
    kappa_target=1.5,
    n_particles=20
)

# Run both
summary_learned = system_learned.run(n_steps=100, verbose=False)
summary_random = system_random.run(n_steps=100, verbose=False)

print(f"Learned init: E_drift = {summary_learned['energy_drift']:.6f}")
print(f"Random init:  E_drift = {summary_random['energy_drift']:.6f}")
```

---

## Checkpoint Selection Strategy

### By Level

```python
# Early curriculum (simple geometries)
ckpt_early = 'polylipse_curriculum_results/level_0_checkpoint.pt'    # κζ ≈ 1.0

# Mid curriculum
ckpt_mid = 'polylipse_curriculum_results/level_500_checkpoint.pt'  # κζ ≈ 1.5

# Late curriculum (complex geometries)
ckpt_late = 'polylipse_curriculum_results/level_1200_checkpoint.pt' # κζ ≈ 2.0+
```

### By κζ Value

```python
# Specific κζ targets
checkpoints = {
    'isotropic': load_checkpoint_by_kappa(1.0, tolerance=0.05),
    'moderate': load_checkpoint_by_kappa(1.5, tolerance=0.05),
    'anisotropic': load_checkpoint_by_kappa(2.5, tolerance=0.1)
}

for name, ckpt_path in checkpoints.items():
    if ckpt_path:
        print(f"{name}: {ckpt_path}")
```

---

## Advanced: Fine-Tuning for Physics

You can fine-tune the pre-trained model for specific physics tasks:

```python
import torch
import torch.nn as nn
from pretrained_integration import PreTrainedParticlePredictor

# Load pre-trained model
predictor = PreTrainedParticlePredictor(checkpoint_path)

# Unfreeze for fine-tuning
predictor.zeta_block.train()

# Add a physics-specific head
class ForcePredictor(nn.Module):
    def __init__(self, predictor, n_dim=2):
        super().__init__()
        self.encoder = predictor.zeta_block
        self.force_head = nn.Sequential(
            nn.Linear(predictor.model_config['d_model'], 64),
            nn.ReLU(),
            nn.Linear(64, n_dim)
        )

    def forward(self, state_encoding):
        features, kappa = self.encoder(state_encoding)
        forces = self.force_head(features)
        return forces, kappa

force_predictor = ForcePredictor(predictor)

# Train on physics data
# ... (training loop with physics losses)
```

---

## Visualization with Pre-Trained Models

```python
from pretrained_integration import create_physics_system_from_checkpoint
from particle_visualization import plot_system_overview

# Create system from checkpoint
system, predictor = create_physics_system_from_checkpoint(
    load_checkpoint_by_kappa(1.5),
    n_particles=25
)

# Run
system.run(n_steps=100, verbose=True)

# Visualize
import matplotlib.pyplot as plt
fig = plot_system_overview(system)
fig.suptitle(f"Learned Init: κζ={predictor.get_curriculum_kappa():.4f}", fontsize=16)
plt.savefig('learned_system.png', dpi=150)
```

---

## Batch Processing Multiple Checkpoints

```python
from pathlib import Path
import pandas as pd

results = []

# Test multiple checkpoints
for ckpt_path in Path('polylipse_curriculum_results').glob('level_*00_checkpoint.pt'):
    try:
        system, predictor = create_physics_system_from_checkpoint(
            str(ckpt_path),
            n_particles=20
        )

        summary = system.run(n_steps=50, verbose=False)

        results.append({
            'checkpoint': ckpt_path.name,
            'kappa_trained': predictor.get_curriculum_kappa(),
            'kappa_final': summary['kappa_mean'],
            'energy_drift': summary['energy_drift'],
            'converged': not summary['energy_violation']
        })
    except Exception as e:
        print(f"Failed: {ckpt_path.name} - {e}")

# Analyze
df = pd.DataFrame(results)
print(df.describe())
```

---

## Performance Tips

1. **GPU Acceleration**: Pre-trained models run faster on GPU
   ```python
   predictor = PreTrainedParticlePredictor(
       checkpoint_path,
       device='cuda'  # or 'cpu'
   )
   ```

2. **Checkpoint Caching**: Load once, use many times
   ```python
   # Cache predictor
   global_predictor = PreTrainedParticlePredictor(checkpoint_path)

   # Reuse for multiple systems
   for i in range(10):
       state = global_predictor.predict_particle_configuration(foci, 20)
   ```

3. **Batch Predictions**: Process multiple states together
   ```python
   # Stack multiple states
   batch = torch.stack([encode_state(s) for s in states])
   # Forward in one pass
   out, kappas = predictor.zeta_block(batch)
   ```

---

## Troubleshooting

### Checkpoint Not Found
```python
# List available checkpoints
from pathlib import Path
checkpoints = list(Path('polylipse_curriculum_results').glob('*.pt'))
print(f"Found {len(checkpoints)} checkpoints")
print(f"Levels: {min(...)} to {max(...)}")
```

### κζ Mismatch
```python
# Check what the checkpoint actually contains
import torch
ckpt = torch.load(checkpoint_path, map_location='cpu')
print(f"κζ: {ckpt['curriculum_info']['kappa_zeta']}")
print(f"n_foci: {ckpt['dataset_config']['n_foci']}")
```

### Device Errors
```python
# Explicitly set device
predictor = PreTrainedParticlePredictor(
    checkpoint_path,
    device='cpu'  # Force CPU if CUDA issues
)
```

---

## Summary

You now have access to **1300+ pre-trained models** that understand κζ geometry!

**Key Files:**
- `pretrained_integration.py` - Integration module
- `polylipse_curriculum_results/level_*.pt` - Pre-trained checkpoints

**Core Functions:**
```python
from pretrained_integration import (
    PreTrainedParticlePredictor,           # Load and use models
    load_checkpoint_by_kappa,              # Find by κζ value
    create_physics_system_from_checkpoint  # One-line integration
)
```

**Next Steps:**
1. Run `python pretrained_integration.py` to see demo
2. Try different checkpoints with particle physics
3. Experiment with learned vs random initialization
4. Fine-tune for your specific physics task

---

**Happy exploring! 🚀**
