# Checkpoint Structure Reference

## Overview

The curriculum checkpoints have **two different structures** depending on the training level:

1. **Early Checkpoints** (level_0 to ~level_100): Simplified structure
2. **Later Checkpoints** (level_100+ to level_1300+): Full nested structure

---

## 1. Early Checkpoint Structure (Simplified)

**Example:** `level_0_checkpoint.pt`

### Top-Level Keys

```python
{
    'model_state': OrderedDict,      # Model weights
    'classifier_state': OrderedDict, # Classifier weights
    'n_foci': int,                   # Number of focal points
    'stabilized_kappa': float,       # κζ value (THIS IS IT!)
    'total_epochs': int              # Total training epochs
}
```

### Accessing κζ (Kappa Zeta)

```python
import torch

ckpt = torch.load('polylipse_curriculum_results/level_0_checkpoint.pt', map_location='cpu')

# CORRECT ACCESS for early checkpoints:
kappa_zeta = ckpt['stabilized_kappa']  # Direct top-level access
n_foci = ckpt['n_foci']
```

### Example Values

```python
{
    'n_foci': 0,
    'stabilized_kappa': 0.2100941642356708,
    'total_epochs': 1600
}
```

---

## 2. Later Checkpoint Structure (Full)

**Example:** `level_1000_checkpoint.pt`

### Top-Level Keys

```python
{
    'model_config': dict,            # Model architecture config
    'model_state_dict': OrderedDict, # Model weights
    'classifier_state_dict': OrderedDict,
    'optimizer_state_dict': dict,    # Optimizer state
    'metrics': dict,                 # Training metrics
    'dataset_config': dict,          # Dataset configuration
    'curriculum_info': dict,         # Curriculum metadata
    'training_config': dict,         # Training hyperparameters
    'viz_config': dict,              # Visualization config
    'metadata': dict                 # Additional metadata
}
```

### Accessing κζ (Kappa Zeta)

```python
import torch

ckpt = torch.load('polylipse_curriculum_results/level_1000_checkpoint.pt', map_location='cpu')

# CORRECT ACCESS for later checkpoints:
kappa_zeta = ckpt['dataset_config']['stabilized_kappa']
# Also available:
observed_kappa = ckpt['dataset_config']['observed_kappa']
kappa_actual = ckpt['dataset_config']['kappa_actual']

n_foci = ckpt['dataset_config']['n_foci']
```

### Detailed Breakdown

#### `model_config`

```python
{
    'd_model': 32,
    'n_heads': 4,
    'enable_zeta_norm': True,
    'kappa_strength': 0.05
}
```

#### `dataset_config` (CONTAINS KAPPA!)

```python
{
    'n_foci': 3,
    'observed_kappa': 1.5653475619215975,      # Observed κζ during training
    'stabilized_kappa': 1.5653475619215975,    # Stabilized κζ value ✓
    'kappa_actual': 1.565347541414753,         # Actual computed κζ
    'focal_angles': array([...]),              # Focal point angles
    'focal_weights': array([...]),             # Focal point weights
    'focal_centers': array([...]),             # Focal point positions
    'M_tau': float,                            # Tau moment
    'M_sigma': float,                          # Sigma moment
    'focal_radius': 2.0,
    'orbit_radius': 3.0,
    'orbit_std': 0.3,
    'noise': 0.05,
    'n_samples': 1000,
    'embedding_seed': int
}
```

#### `curriculum_info`

```python
{
    'level': 1000,
    'previous_kappa': float,
    'transition_epoch': int,
    'epochs_at_level': int,
    'is_stable': bool,
    'stability_variance': float,
    'convergence_rate': float
}
```

**NOTE:** `curriculum_info` does **NOT** contain `kappa_zeta`! Use `dataset_config['stabilized_kappa']` instead.

#### `metrics`

```python
{
    'final_loss': float,
    'final_accuracy': float,
    'loss_history': list,
    'accuracy_history': list,
    # ... other training metrics
}
```

#### `training_config`

```python
{
    'batch_size': 32,
    'lr': 0.001,
    'n_epochs': 3200,
    'device': 'cuda'
}
```

---

## 3. Robust Access Pattern (Both Formats)

Use this helper function to handle both checkpoint formats:

```python
def get_kappa_zeta(checkpoint_path: str) -> float:
    """
    Robustly extract κζ value from any checkpoint format.

    Args:
        checkpoint_path: Path to .pt checkpoint file

    Returns:
        kappa_zeta: The κζ value
    """
    import torch

    ckpt = torch.load(checkpoint_path, map_location='cpu')

    # Method 1: Early checkpoint format (top-level)
    if 'stabilized_kappa' in ckpt:
        return ckpt['stabilized_kappa']

    # Method 2: Later checkpoint format (nested in dataset_config)
    if 'dataset_config' in ckpt and 'stabilized_kappa' in ckpt['dataset_config']:
        return ckpt['dataset_config']['stabilized_kappa']

    # Method 3: Try observed_kappa as fallback
    if 'dataset_config' in ckpt and 'observed_kappa' in ckpt['dataset_config']:
        return ckpt['dataset_config']['observed_kappa']

    raise KeyError(f"Could not find kappa_zeta in checkpoint: {checkpoint_path}")


def get_n_foci(checkpoint_path: str) -> int:
    """Extract number of focal points from checkpoint."""
    import torch

    ckpt = torch.load(checkpoint_path, map_location='cpu')

    # Method 1: Top-level
    if 'n_foci' in ckpt:
        return ckpt['n_foci']

    # Method 2: Nested in dataset_config
    if 'dataset_config' in ckpt and 'n_foci' in ckpt['dataset_config']:
        return ckpt['dataset_config']['n_foci']

    raise KeyError(f"Could not find n_foci in checkpoint: {checkpoint_path}")
```

---

## 4. Complete Example Usage

### Loading and Inspecting

```python
import torch
from pathlib import Path

def inspect_checkpoint(checkpoint_path):
    """Full checkpoint inspection."""
    ckpt = torch.load(checkpoint_path, map_location='cpu')

    print(f"Checkpoint: {Path(checkpoint_path).name}")
    print(f"Top-level keys: {list(ckpt.keys())}")
    print()

    # Extract κζ (robust)
    kappa_zeta = get_kappa_zeta(checkpoint_path)
    n_foci = get_n_foci(checkpoint_path)

    print(f"κζ (kappa_zeta): {kappa_zeta:.6f}")
    print(f"n_foci: {n_foci}")

    # Check format
    if 'dataset_config' in ckpt:
        print("Format: FULL (later checkpoint)")
        print(f"  Model config: d_model={ckpt['model_config']['d_model']}, "
              f"n_heads={ckpt['model_config']['n_heads']}")
        if 'curriculum_info' in ckpt:
            print(f"  Curriculum: level={ckpt['curriculum_info']['level']}")
    else:
        print("Format: SIMPLIFIED (early checkpoint)")
        print(f"  Total epochs: {ckpt.get('total_epochs', 'N/A')}")

    return kappa_zeta, n_foci


# Example usage
kappa, n_foci = inspect_checkpoint('polylipse_curriculum_results/level_1000_checkpoint.pt')
```

### Finding Checkpoint by κζ Value

```python
from pathlib import Path

def find_checkpoint_by_kappa(
    target_kappa: float,
    checkpoint_dir: str = 'polylipse_curriculum_results',
    tolerance: float = 0.1
) -> str:
    """Find checkpoint closest to target κζ."""
    checkpoint_dir = Path(checkpoint_dir)

    best_checkpoint = None
    best_diff = float('inf')

    for ckpt_path in checkpoint_dir.glob('level_*_checkpoint.pt'):
        try:
            kappa = get_kappa_zeta(str(ckpt_path))
            diff = abs(kappa - target_kappa)

            if diff < best_diff:
                best_diff = diff
                best_checkpoint = str(ckpt_path)
        except Exception:
            continue

    if best_diff <= tolerance:
        return best_checkpoint

    return None


# Find checkpoint for κζ=1.5
ckpt_path = find_checkpoint_by_kappa(1.5, tolerance=0.05)
if ckpt_path:
    print(f"Found: {Path(ckpt_path).name}")
    kappa = get_kappa_zeta(ckpt_path)
    print(f"Actual κζ: {kappa:.6f}")
```

---

## 5. Common Pitfalls

### ❌ WRONG: Assuming nested structure everywhere

```python
# This FAILS on early checkpoints!
kappa = ckpt['curriculum_info']['kappa_zeta']  # KeyError!
```

### ❌ WRONG: Assuming curriculum_info has kappa_zeta

```python
# curriculum_info does NOT contain kappa_zeta even in later checkpoints!
kappa = ckpt['curriculum_info']['kappa_zeta']  # KeyError!
```

### ✅ CORRECT: Use robust accessor

```python
# Works for all checkpoint formats
kappa = get_kappa_zeta(checkpoint_path)
```

---

## 6. Summary Table

| Field | Early Checkpoints | Later Checkpoints |
|-------|------------------|-------------------|
| **κζ Access** | `ckpt['stabilized_kappa']` | `ckpt['dataset_config']['stabilized_kappa']` |
| **n_foci** | `ckpt['n_foci']` | `ckpt['dataset_config']['n_foci']` |
| **Model Weights** | `ckpt['model_state']` | `ckpt['model_state_dict']` |
| **Classifier** | `ckpt['classifier_state']` | `ckpt['classifier_state_dict']` |
| **Has curriculum_info?** | ❌ No | ✅ Yes (but no kappa_zeta!) |
| **Has dataset_config?** | ❌ No | ✅ Yes |
| **Optimizer State?** | ❌ No | ✅ Yes |

---

## 7. When Does Format Change?

Based on file inspection:
- **level_0**: Simplified format
- **level_1000**: Full format

Transition appears to occur somewhere between level_0 and level_100. To be safe, always use the robust accessor function.

---

## 8. Integration with Particle Physics

When loading checkpoints for particle physics simulations:

```python
from pretrained_integration import PreTrainedParticlePredictor

# The predictor now handles both formats internally
predictor = PreTrainedParticlePredictor(checkpoint_path)

# Get κζ value (works for both formats)
kappa = predictor.get_curriculum_kappa()
```

---

**Date:** 2025-01-08
**Updated:** After deep structure analysis
**Checkpoints Analyzed:** 1378 total (level_0 to level_1377)
