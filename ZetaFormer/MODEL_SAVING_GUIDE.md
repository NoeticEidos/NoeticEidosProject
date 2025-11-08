# Model Saving and Loading Guide

Complete guide for saving and loading ζ-normalized ZetaBlock models.

---

## 📦 What Gets Saved

When you save a ζ-normalized model, the checkpoint includes:

1. **Model Weights**
   - ZetaBlockEnhanced parameters (W_Q, W_K, W_V, W_O)
   - Poisson parameters (β, t)
   - LayerNorm parameters

2. **Classifier Weights**
   - Linear classification head

3. **ζ-Normalization State**
   - Dynamic offset m* (global scale calibration)
   - Local EMA state (kappa_smooth)
   - Complete κζ history (raw + calibrated + offset logs)

4. **Training Metrics**
   - κζ evolution per epoch (raw, calibrated, offset)
   - Loss trajectories (total, task, zero-set)
   - Parameter evolution (β, t snapshots)
   - Training summary statistics

5. **Hyperparameters**
   - Model architecture (d_model, n_heads)
   - Training configuration (epochs, batch_size, lr)
   - ζ-normalization settings (kappa_strength, zeta_s)

---

## 💾 Saving Models

### Basic Save

```python
from training_loop_enhanced import train_zeta_block, save_zeta_model

# Train model
model, classifier, metrics = train_zeta_block(
    make_dataset_fn=make_data,
    d_model=32,
    n_heads=4,
    n_epochs=20,
    enable_zeta_norm=True,
)

# Save checkpoint
save_zeta_model(
    model, classifier, metrics,
    save_path='./checkpoints/my_model.pt'
)
```

### Save with Hyperparameters

```python
# Save with full hyperparameter tracking
save_zeta_model(
    model, classifier, metrics,
    save_path='./checkpoints/my_model.pt',
    hyperparameters={
        'd_model': 32,
        'n_heads': 4,
        'n_epochs': 20,
        'batch_size': 64,
        'lr': 1e-3,
        'kappa_strength': 0.05,
        'enable_zeta_norm': True,
        'dataset': 'ellipses',
        'notes': 'Experiment v1.2 - two-stage smoothing',
    }
)
```

**Output:**
```
Model saved to: ./checkpoints/my_model.pt
  - Model parameters: 8,448
  - Classifier parameters: 66
  - Final κζ_cal: -0.0234
  - Final offset m*: 1.5127
```

---

## 📂 Loading Models

### Basic Load

```python
from training_loop_enhanced import load_zeta_model

# Load checkpoint
model, classifier, metrics_dict, hparams = load_zeta_model(
    './checkpoints/my_model.pt',
    device='cuda'
)
```

**Output:**
```
Model loaded from: ./checkpoints/my_model.pt
  - d_model=32, n_heads=4
  - ζ-normalization: enabled
  - Restored offset m*: 1.5127
  - Training epochs: 20
```

### Inspect Loaded State

```python
# Check hyperparameters
print("Hyperparameters:")
for key, val in hparams.items():
    print(f"  {key}: {val}")

# Check training metrics
print(f"\nFinal loss: {metrics_dict['summary']['final_loss']:.4f}")
print(f"κζ convergence rate: {metrics_dict['summary']['kappa_convergence']:.6f}")

# Check ζ-normalization state
print(f"\nOffset m*: {model.zeta_translator.offset:.4f}")
print(f"κζ smooth state: {model.kappa_smooth:.4f}")
print(f"κζ history length: {len(model.kappa_log)}")
```

### Resume Inference

```python
# Run inference on new data
model.eval()
classifier.eval()

with torch.no_grad():
    X_test = torch.randn(10, 20, 32)  # (batch, seq, d_model)
    output = model(X_test)
    logits = classifier(output)
    predictions = logits.argmax(dim=-1)

print(f"Predictions: {predictions.shape}")
```

---

## 🔄 Complete Workflow Example

```python
from training_loop_enhanced import (
    train_zeta_block,
    save_zeta_model,
    load_zeta_model
)

# ===== 1. Train Model =====
def make_data():
    X = torch.randn(1000, 50, 32)
    y = torch.randint(0, 2, (1000, 50))
    mask = torch.ones(1000, 50, dtype=torch.bool)
    return X, y, mask

model, clf, metrics = train_zeta_block(
    make_dataset_fn=make_data,
    d_model=32,
    n_heads=4,
    n_epochs=20,
    enable_zeta_norm=True,
    kappa_strength=0.05,
)

# ===== 2. Save Model =====
save_zeta_model(
    model, clf, metrics,
    save_path='./checkpoints/trained_model.pt',
    hyperparameters={
        'd_model': 32,
        'n_heads': 4,
        'n_epochs': 20,
        'kappa_strength': 0.05,
    }
)

# ===== 3. Load Model Later =====
model_loaded, clf_loaded, metrics_dict, hparams = load_zeta_model(
    './checkpoints/trained_model.pt',
    device='cuda'
)

# ===== 4. Verify Restoration =====
print(f"Loaded model - Final loss: {metrics_dict['summary']['final_loss']:.4f}")
print(f"Offset m* restored: {model_loaded.zeta_translator.offset:.4f}")

# ===== 5. Use for Inference =====
model_loaded.eval()
with torch.no_grad():
    output = model_loaded(torch.randn(1, 50, 32))
    print(f"Inference successful! Output shape: {output.shape}")
```

---

## 📊 Accessing Saved Metrics

The loaded `metrics_dict` contains all training history:

```python
model, clf, metrics_dict, hparams = load_zeta_model('./checkpoints/my_model.pt')

# Epoch-level metrics
kappa_calibrated = metrics_dict['epoch_kappa']       # List[List[float]]
kappa_raw = metrics_dict['epoch_kappa_raw']          # Raw κζ (science)
offset = metrics_dict['epoch_offset']                # Offset m* evolution
beta_history = metrics_dict['epoch_beta']            # β snapshots
t_history = metrics_dict['epoch_t']                  # t snapshots

# Loss trajectories
losses = metrics_dict['epoch_loss']                  # Total loss per epoch
task_losses = metrics_dict['epoch_task_loss']        # Task loss
zero_losses = metrics_dict['epoch_zero_loss']        # Zero-set loss

# Summary statistics
summary = metrics_dict['summary']
print(f"Final κζ mean: {summary['final_kappa_mean']:.4f}")
print(f"κζ convergence rate: {summary['kappa_convergence']:.6f}")
print(f"β drift: {summary['beta_drift']:.4f}")
print(f"t drift: {summary['t_drift']:.4f}")
```

### Visualize Loaded Metrics

```python
import matplotlib.pyplot as plt
import numpy as np

# Plot κζ evolution
kappa_flat = [k for epoch in metrics_dict['epoch_kappa'] for k in epoch]
plt.plot(kappa_flat, alpha=0.7, label='κζ calibrated')
plt.axhline(0, linestyle='--', color='red', alpha=0.5, label='Critical line')
plt.xlabel('Batch iteration')
plt.ylabel('κζ')
plt.legend()
plt.title('κζ Evolution from Saved Checkpoint')
plt.show()

# Plot offset convergence
offset_flat = [o for epoch in metrics_dict['epoch_offset'] for o in epoch]
plt.plot(offset_flat, color='orange', label='Offset m*')
plt.axhline(offset_flat[-1], linestyle='--', alpha=0.5)
plt.xlabel('Batch iteration')
plt.ylabel('Offset m*')
plt.title('Global Scale Offset Convergence')
plt.legend()
plt.show()
```

---

## 🔧 Advanced Usage

### Save Multiple Checkpoints During Training

```python
def train_with_checkpoints(save_dir='./checkpoints'):
    import os
    os.makedirs(save_dir, exist_ok=True)

    for epoch in [10, 20, 50, 100]:
        model, clf, metrics = train_zeta_block(
            make_dataset_fn=make_data,
            n_epochs=epoch,
            # ... other args ...
        )

        checkpoint_path = os.path.join(save_dir, f'model_epoch_{epoch}.pt')
        save_zeta_model(model, clf, metrics, checkpoint_path)
        print(f"Checkpoint saved at epoch {epoch}")
```

### Compare Multiple Checkpoints

```python
# Load different checkpoints
model_ep10, clf10, metrics10, _ = load_zeta_model('./checkpoints/model_epoch_10.pt')
model_ep50, clf50, metrics50, _ = load_zeta_model('./checkpoints/model_epoch_50.pt')

# Compare convergence
print(f"Epoch 10 - κζ convergence: {metrics10['summary']['kappa_convergence']:.6f}")
print(f"Epoch 50 - κζ convergence: {metrics50['summary']['kappa_convergence']:.6f}")

# Compare final losses
print(f"Epoch 10 - Final loss: {metrics10['summary']['final_loss']:.4f}")
print(f"Epoch 50 - Final loss: {metrics50['summary']['final_loss']:.4f}")
```

### Load and Fine-tune

```python
# Load pretrained model
model, clf, _, hparams = load_zeta_model('./checkpoints/pretrained.pt')

# Continue training with new data
optimizer = torch.optim.Adam(
    list(model.parameters()) + list(clf.parameters()),
    lr=1e-4  # Lower learning rate for fine-tuning
)

# Fine-tuning loop
model.train()
for epoch in range(10):  # Fine-tune for 10 more epochs
    # ... training loop ...
    pass

# Save fine-tuned model
save_zeta_model(model, clf, new_metrics, './checkpoints/finetuned.pt')
```

---

## 📓 Interactive Analysis with Zeta Calculator Notebook

For comprehensive κζ analysis and visualization, use the **Zeta Calculator Notebook** (`Zeta_Calculator.ipynb`).

### Features

The notebook provides:

1. **ZetaTranslator Calculator** - Compute κζ on arbitrary symmetric matrices
2. **ZetaBlock Runtime Analysis** - Live κζ from model activations during forward passes
3. **Component Visualization** - Analyze Gaussian (τ) vs Poisson (σ) attention pathways
4. **Parameter Monitoring** - Track β and t adaptation via κζ feedback loop
5. **Multi-layer Profiling** - Curvature profiles across model depth
6. **Training History** - Rich visualizations of checkpoint metrics

### Quick Start

```python
# In Jupyter notebook
import torch
from training_loop_enhanced import load_zeta_model
import notebook_helpers as nh

# Load your trained model
model, clf, metrics_dict, hparams = load_zeta_model(
    './zeta_comparison_results/zeta_normalized/model_checkpoint.pt',
    device='cpu'
)

# Extract ZetaTranslator
translator = model.zeta_translator
print(f"Offset m*: {translator.offset:.4f}")
print(f"s parameter: {translator.s}")
```

### Usage Examples

**1. Compute κζ on Custom Matrix:**

```python
import numpy as np

# Your matrix
A = np.random.randn(32, 32)
G = A @ A.T + np.eye(32) * 1.0

# Compute eigenvalues
eigvals = np.linalg.eigvalsh(G)

# Get κζ
kappa_raw, kappa_cal, offset = translator.kappa(
    eigvals,
    return_tuple=True
)

print(f"κζ calibrated: {kappa_cal:.6f}")
print(f"κζ raw: {kappa_raw:.6f}")
```

**2. Run Forward Pass with Analysis:**

```python
# Create sample input
sample_input = torch.randn(4, 20, model.d_model)

# Analyze forward pass
result = nh.forward_with_analysis(
    model,
    sample_input,
    return_eigvals=True
)

print(f"κζ from activations: {result['kappa']:.6f}")
print(f"β parameters: {result['beta']}")
print(f"t parameters: {result['t']}")
```

**3. Visualize τ/σ Pathways:**

```python
# Decompose attention pathways
pathway_dict = nh.decompose_attention_pathways(model, sample_input)

# Get statistics
stats = nh.compare_pathway_statistics(
    pathway_dict['tau'],
    pathway_dict['sigma']
)

print(f"Correlation (τ, σ): {stats['correlation']:.4f}")

# Plot comparison
fig = nh.plot_pathway_comparison(pathway_dict, sample_idx=0, head_idx=0)
```

**4. Monitor Parameter Adaptation:**

```python
# Create sequence of inputs
input_sequence = [torch.randn(2, 15, model.d_model) for _ in range(20)]

# Track β, t evolution
model.train()  # Enable adaptation
trajectories = nh.monitor_parameter_adaptation(
    model,
    input_sequence,
    track_kappa=True
)

# Visualize
fig = nh.plot_parameter_trajectories(trajectories)
```

**5. Visualize Training History:**

```python
# Extract metrics from checkpoint
kappa_flat = [k for epoch in metrics_dict['epoch_kappa'] for k in epoch]
offset_flat = [o for epoch in metrics_dict['epoch_offset'] for o in epoch]

# Plot κζ evolution
import matplotlib.pyplot as plt

plt.figure(figsize=(12, 5))
plt.subplot(1, 2, 1)
plt.plot(kappa_flat, alpha=0.7, label='κζ calibrated')
plt.axhline(0, color='red', linestyle='--', alpha=0.5, label='Critical line')
plt.xlabel('Batch iteration')
plt.ylabel('κζ')
plt.legend()
plt.title('κζ Convergence')

plt.subplot(1, 2, 2)
plt.plot(offset_flat, color='orange', label='Offset m*')
plt.xlabel('Batch iteration')
plt.ylabel('Offset m*')
plt.legend()
plt.title('Global Scale Offset')
plt.show()
```

### Notebook Sections

The full notebook (`Zeta_Calculator.ipynb`) contains:

1. **Section 1**: Setup & Model Loading
2. **Section 2**: ZetaTranslator Calculator (standalone matrices)
3. **Section 3**: ZetaBlock Runtime Analysis (activation-based κζ)
4. **Section 4**: Internal Component Analysis (τ, σ pathways)
5. **Section 5**: Poisson Parameter Monitoring (β, t dynamics)
6. **Section 6**: Multi-Layer Profiling (depth analysis)
7. **Section 7**: Training History Analysis (checkpoint metrics)
8. **Section 8**: Export & Summary

### Running the Notebook

```bash
cd C:/Users/Sar/git/Research/ZetaFormer
jupyter notebook Zeta_Calculator.ipynb
```

Or use VS Code with Jupyter extension:
- Open `Zeta_Calculator.ipynb` in VS Code
- Select Python kernel
- Run cells sequentially

### Helper Functions Reference

The notebook uses `notebook_helpers.py` which provides:

- `forward_with_analysis()` - Extract all components from forward pass
- `decompose_attention_pathways()` - Separate τ and σ pathways
- `monitor_parameter_adaptation()` - Track β/t evolution
- `profile_all_layers()` - Multi-layer κζ profiling
- `plot_eigenspectrum_analysis()` - Visualize eigenvalues + κζ
- `plot_pathway_comparison()` - τ vs σ visualization
- `plot_parameter_trajectories()` - β/t/κζ evolution
- `plot_layer_profile()` - Layer-wise curvature

---

## 📁 Checkpoint Structure

The `.pt` file contains a dictionary with this structure:

```python
checkpoint = {
    'model_config': {
        'd_model': int,
        'n_heads': int,
        'zeta_s': float,
        'dynamics_alpha': float,          # ZetaTranslator EMA rate (NEW)
        'kappa_strength': float,
        'enable_zeta_norm': bool,
        'baseline_window': int,
    },
    'model_state_dict': OrderedDict,      # PyTorch state dict
    'classifier_state_dict': OrderedDict,
    'zeta_state': {
        'offset': float,                  # Dynamic offset m*
        'kappa_smooth': float,            # Local EMA state
        'kappa_log': List[float],         # Calibrated κζ history
        'kappa_raw_log': List[float],     # Raw κζ history
        'offset_log': List[float],        # Offset evolution
        'beta_mean_log': List[float],     # β mean tracking (NEW)
        't_mean_log': List[float],        # t mean tracking (NEW)
    },
    'metrics': {
        'epoch_kappa': List[List[float]],
        'epoch_kappa_raw': List[List[float]],
        'epoch_offset': List[List[float]],
        'epoch_beta': List[List[float]],
        'epoch_t': List[List[float]],
        'epoch_loss': List[float],
        'epoch_task_loss': List[float],
        'epoch_zero_loss': List[float],
        'summary': Dict[str, float],
    },
    'hyperparameters': Dict,
    'n_classes': int,
}
```

---

## ✅ Best Practices

1. **Always save hyperparameters**: Include dataset name, experiment notes, and key settings
2. **Checkpoint frequently**: Save at multiple epochs to avoid losing progress
3. **Verify loading**: Check offset restoration and metric counts after loading
4. **Version control**: Name checkpoints with experiment version/date
5. **Test inference**: Always run a quick inference test after loading

---

## 🚀 Quick Start Examples

See complete working examples in:
- `example_save_load.py` - Full save/load demonstration
- `example_zeta_normalization.py` - Saves models after comparison experiment
- **`Zeta_Calculator.ipynb`** - Interactive analysis notebook (NEW)
- `notebook_helpers.py` - Helper functions for notebook analysis

Run:
```bash
python example_save_load.py          # Save/load demo
python example_zeta_normalization.py # Full experiment with auto-save
jupyter notebook Zeta_Calculator.ipynb # Interactive κζ analysis
```

---

**Version:** 2.0 (Now with Zeta Calculator Notebook!)
**Author:** Sar Hamam (Noetic Eidos Project) + Claude (Anthropic)
**Date:** 2025

*"Save once, load anywhere: ζ-normalization state travels with your model."*