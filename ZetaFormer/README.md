# ZetaFormer: Adaptive Polylipse Curriculum Learning

A curriculum learning framework for transformer models using geometrically-structured datasets (polylipses) driven by emergent κζ (kappa-zeta) dynamics.

## Overview

ZetaFormer implements an adaptive curriculum that progressively trains models on increasingly complex n-focal geometric distributions. The key innovation is that **the geometry of each curriculum level is determined by the emergent κζ ratio** from the previous level, creating a discovered learning path rather than a predetermined one.

### Key Concepts

- **Polylipse Dataset**: Multi-focal geometric distribution where data points cluster around n foci in d-dimensional space
- **κζ (Kappa-Zeta) Ratio**: M_τ/M_σ metric measuring anisotropy of learned representations
  - M_τ: Radial moment (temporal/directional variance)
  - M_σ: Angular moment (spatial/spread variance)
- **Adaptive Curriculum**: Geometry adapts based on emergent κζ values during training
- **CGD Solver**: Conjugate Gradient Descent with dual-kernel (Gaussian-Poisson) attention

## Project Structure

```
ZetaFormer/
├── polylipse_dataset.py           # Dataset generation with focal configuration
├── adaptive_curriculum_trainer.py # Curriculum training with κζ-driven progression
├── checkpoint_visualization.py    # Single checkpoint analysis tools
├── curriculum_visualization.py    # Multi-level curriculum analysis tools
├── checkpoint_viz_cli.py          # Command-line interface for visualization
├── example_adaptive_polylipse.py  # Example training and visualization scripts
├── polylipse_visualization.py     # Visualization utilities and CGD solver
└── README.md                      # This file
```

## Installation

```bash
# Install dependencies
pip install torch numpy matplotlib

# Clone repository
git clone <repository-url>
cd ZetaFormer
```

## Quick Start

### 1. Train an Adaptive Curriculum

```bash
# Quick demo (1→3 foci, fast)
python example_adaptive_polylipse.py quick

# Full curriculum (1→5 foci)
python example_adaptive_polylipse.py full

# Custom curriculum (1→N foci)
python example_adaptive_polylipse.py full 10
```

### 2. Visualize Trained Checkpoints

```bash
# Visualize curriculum progression
python example_adaptive_polylipse.py viz

# Include CGD decision boundaries
python example_adaptive_polylipse.py viz --cgd

# Visualize specific directory
python example_adaptive_polylipse.py viz ./my_curriculum --cgd
```

### 3. CLI Visualization Tools

```bash
# Comprehensive curriculum report
python checkpoint_viz_cli.py curriculum ./polylipse_curriculum_results

# Single checkpoint analysis
python checkpoint_viz_cli.py checkpoint ./level_3_checkpoint.pt

# Compare multiple runs
python checkpoint_viz_cli.py compare run1/ run2/ run3/ --names "Baseline" "High LR" "Strong κ"

# Display checkpoint info
python checkpoint_viz_cli.py info ./polylipse_curriculum_results
```

## Enhanced Checkpoint Format

Checkpoints now save comprehensive training state (as of latest version):

```python
checkpoint = {
    'model_config': {
        'd_model': 32,
        'n_heads': 4,
        'enable_zeta_norm': True,
        'kappa_strength': 0.05
    },
    'model_state_dict': OrderedDict(...),
    'classifier_state_dict': OrderedDict(...),
    'optimizer_state_dict': OrderedDict(...),
    'metrics': {
        'epoch_kappa': [...],       # Calibrated κζ per epoch
        'epoch_kappa_raw': [...],   # Raw κζ per epoch
        'epoch_offset': [...],
        'epoch_beta': [...],
        'epoch_t': [...],
        'epoch_loss': [...]
    },
    'dataset_config': {
        'n_foci': 3,
        'observed_kappa': 1.245,
        'focal_angles': [...],      # Angles of foci
        'focal_weights': [...],     # Weights for each focus
        'focal_centers': [...],     # 2D coordinates
        'M_tau': 1.123,
        'M_sigma': 0.902,
        'd_model': 32
    },
    'curriculum_info': {
        'level': 3,
        'is_stable': True,
        'stability_variance': 0.012,
        'convergence_rate': 0.0345,
        'stabilized_kappa': 1.248
    },
    'training_config': {...},
    'viz_config': {...},
    'metadata': {
        'version': '2.0',
        'timestamp': '2025-01-08T...',
        'pytorch_version': '2.1.0'
    }
}
```

**Legacy checkpoints** (pre-enhancement) are automatically supported with graceful fallback.

## Visualization System

### CheckpointVisualizer (Single Checkpoint)

Analyze individual curriculum levels:

```python
from checkpoint_visualization import CheckpointVisualizer

vis = CheckpointVisualizer("./level_3_checkpoint.pt")

# Generate all visualizations
vis.plot_polylipse_geometry(save_path="geometry.png")
vis.plot_training_history(save_path="history.png")
vis.plot_kappa_evolution(save_path="kappa.png")
vis.plot_cgd_decision_boundary(save_path="cgd.png")
```

### CurriculumVisualizer (Multi-Level)

Analyze complete curriculum progressions:

```python
from curriculum_visualization import CurriculumVisualizer

cv = CurriculumVisualizer("./polylipse_curriculum_results")

# Curriculum progression grid
cv.plot_curriculum_progression(save_path="progression.png")

# κζ trajectory across levels
cv.plot_kappa_trajectory(save_path="trajectory.png")

# Detailed evolution per level
cv.plot_kappa_evolution_detailed(save_path="evolution.png")

# Training metrics across curriculum
cv.plot_training_metrics(save_path="metrics.png")

# CGD boundaries for all levels
cv.plot_cgd_curriculum(save_dir="./cgd/")

# Generate comprehensive report
cv.generate_curriculum_report("./report/", include_cgd=True)
```

## Curriculum Training Pipeline

### How It Works

1. **Level 1 (Isotropic)**: Train on circular (1-focus) distribution, κζ starts at 1.0
2. **Stabilization**: Monitor κζ convergence with sliding window variance
3. **Level Transition**: When stable, use emergent κζ to configure next dataset
4. **Geometric Progression**: Each level's focal configuration is solved from observed κζ
5. **Repeat**: Continue until max_n_foci reached

### Mathematical Foundation

For n foci with target κζ, we solve:

```
M_τ = Σᵢ wᵢ cos²(θᵢ)
M_σ = Σᵢ wᵢ sin²(θᵢ)
κζ = M_τ / M_σ

Subject to:
- Σᵢ wᵢ = 1 (weights sum to 1)
- 0 ≤ θᵢ < 2π (angles)
- wᵢ ≥ 0 (non-negative weights)
```

This is solved via constrained optimization in `solve_focal_config()`.

## Example Workflows

### Train and Visualize

```bash
# Train quick curriculum
python example_adaptive_polylipse.py quick

# Visualize results
python example_adaptive_polylipse.py viz ./polylipse_demo

# Generate comprehensive report with CGD
python checkpoint_viz_cli.py report ./polylipse_demo -o ./analysis --cgd
```

### Explore Focal Mathematics

```bash
# Show how focal configs map to κζ values
python example_adaptive_polylipse.py math
```

### Compare Training Runs

```bash
# Train multiple configurations
python example_adaptive_polylipse.py quick  # Creates ./polylipse_demo

# Compare results
python checkpoint_viz_cli.py compare \
    ./run1 ./run2 ./run3 \
    --names "Baseline" "High LR" "Strong κ" \
    -o ./comparison
```

## API Reference

### Training

```python
from adaptive_curriculum_trainer import train_with_adaptive_curriculum

model, classifier, curriculum = train_with_adaptive_curriculum(
    start_n_foci=1,
    max_n_foci=5,
    epochs_per_level=100,
    stability_window=40,
    stability_threshold=0.015,
    n_samples=2000,
    d_model=32,
    n_heads=4,
    batch_size=64,
    lr=1e-3,
    device="cuda",
    enable_zeta_norm=True,
    kappa_strength=0.05,
    save_dir="./results"
)
```

### Dataset Generation

```python
from polylipse_dataset import make_polylipse_dataset, solve_focal_config

# Generate n-focal dataset with specific κζ
X, y, mask, info = make_polylipse_dataset(
    n_foci=3,
    observed_kappa=1.5,
    n_samples=1000,
    d_model=32,
    return_focal_info=True
)

# Solve focal configuration for target κζ
angles, weights = solve_focal_config(n_foci=3, kappa=1.5)
```

### Visualization

```python
from checkpoint_visualization import visualize_checkpoint
from curriculum_visualization import visualize_curriculum_from_checkpoints

# Quick single checkpoint viz
visualize_checkpoint("./checkpoint.pt", output_dir="./viz")

# Quick curriculum viz
cv = visualize_curriculum_from_checkpoints(
    "./curriculum_dir",
    include_cgd=True
)
```

## Output Files

After running `python checkpoint_viz_cli.py report ./curriculum --cgd`:

```
./curriculum_visualization/
├── curriculum_progression.png      # Grid of all levels
├── kappa_trajectory.png            # κζ across curriculum
├── kappa_evolution_detailed.png    # Per-level κζ evolution
├── training_metrics.png            # Loss, κζ, offset, etc.
├── curriculum_summary.json         # Statistics and metadata
└── cgd/
    ├── level_1_cgd.png            # CGD boundaries per level
    ├── level_2_cgd.png
    └── level_3_cgd.png
```

## Advanced Features

### CGD Decision Boundaries

Visualize learned decision boundaries using dual-kernel (Gaussian-Poisson) attention:

```python
from polylipse_visualization import plot_cgd_polylipse

fig, f, info = plot_cgd_polylipse(
    n_foci=3,
    observed_kappa=1.5,
    sigma=0.5,    # Gaussian bandwidth (τ-kernel)
    t=0.5,        # Poisson scale (σ-kernel)
    w=0.5,        # Mellin mix (0.5 = balanced)
    eta=1e-2,     # Regularization
    save_path="cgd_3focal.png"
)
```

### Custom Curriculum Comparison

```python
from curriculum_visualization import compare_curriculum_runs

fig = compare_curriculum_runs(
    run_dirs=["./baseline", "./experiment1", "./experiment2"],
    run_names=["Baseline", "High κ", "Low κ"],
    output_dir="./comparison"
)
```

### Checkpoint Loading for Inference

```python
from checkpoint_visualization import load_checkpoint_for_inference

model, classifier, config, dataset_info = load_checkpoint_for_inference(
    "./level_3_checkpoint.pt",
    device="cuda"
)

# Use model for inference
model.eval()
with torch.no_grad():
    output = model(X)
```

## Curriculum Metrics

The `CurriculumMetrics` object tracks:

- **Per-level history**: κζ evolution, loss, stability metrics
- **Convergence rates**: How quickly each level stabilized
- **Focal configurations**: Angles, weights, centers for each level
- **Transition points**: When and why levels changed

Access via:

```python
curriculum.summary()  # Print summary
curriculum.get_kappa_trajectory()  # [1.0, 1.23, 1.45, ...]
curriculum.levels  # List of level dictionaries
```

## Known Limitations

1. **Legacy checkpoints**: Older checkpoints lack full metadata but are still supported
2. **High focal counts**: Visualizations optimized for n ≤ 10 foci (adaptive sizing for higher)
3. **CGD computation**: Can be slow for large curricula (use `--cgd` selectively)
4. **Memory**: Loading full curriculum with models can be memory-intensive

## Troubleshooting

### "No checkpoints found"
- Ensure checkpoint directory contains `level_*_checkpoint.pt` files
- Check that training completed successfully

### "Invalid level: n_foci=0"
- Delete incomplete `level_0_checkpoint.pt` files
- These are created but not completed during interrupted training

### Tensor shape errors
- Update to latest version with `.squeeze()` fixes
- Legacy checkpoints may need dataset regeneration

### CGD visualization fails
- Reduce `n_samples` parameter (default 800)
- Skip CGD for high focal counts (n > 10)

## Contributing

Areas for improvement:

1. **3D visualization** for higher-dimensional embeddings
2. **Interactive plots** using plotly/bokeh
3. **Video generation** showing curriculum progression over time
4. **Multi-run aggregation** with confidence intervals
5. **Export to TensorBoard** format

## Citation

```bibtex
@software{zetaformer2025,
  title={ZetaFormer: Adaptive Polylipse Curriculum Learning},
  author={Noetic Eidos Project},
  year={2025},
  url={https://github.com/...}
}
```

## License

MIT License

## Changelog

### v2.0 (2025-01-08)
- ✨ **Enhanced checkpoint format** with comprehensive metadata
- ✨ **Checkpoint visualization system** (`CheckpointVisualizer`)
- ✨ **Curriculum visualization system** (`CurriculumVisualizer`)
- ✨ **CLI interface** for visualization (`checkpoint_viz_cli.py`)
- ✨ **Legacy checkpoint support** with automatic upgrade
- ✨ **CGD decision boundary** visualization
- ✨ **Multi-run comparison** tools
- 🐛 Fixed tensor indexing for visualization
- 🐛 Added `project_to_2d` function for PCA projection
- 📝 Comprehensive documentation

### v1.0 (Initial)
- Polylipse dataset generation
- Adaptive curriculum training
- Basic visualization tools