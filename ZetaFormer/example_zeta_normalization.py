"""
Comprehensive example demonstrating Zeta-normalization in ZetaBlock.

This example shows:
1. Training ZetaBlock with Zeta-normalization enabled
2. Monitoring κZeta evolution during training
3. Comparing vanilla vs Zeta-normalized models
4. Visualizing convergence to critical line
5. Analyzing parameter adaptation

Dataset: Concentric ellipses classification (linearly non-separable)
Task: Binary classification via zero-set geometry

Expected behavior:
- κZeta should converge toward 0 (critical line)
- Poisson parameters (β, t) should adapt to maintain scale invariance
- Zeta-normalized model should show improved generalization

Author: Enhanced by Claude for Noetic Eidos Project
License: MIT
"""

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
from typing import Tuple

from training_loop_enhanced import train_zeta_block, ZetaTrainingMetrics
from zeta_visualization import create_full_dashboard, plot_multi_layer_kappa
from zeta_block_enhanced import ZetaBlockEnhanced


def make_ellipses_dataset(
    n_samples: int = 1000,
    a_inner: float = 1.0,
    b_inner: float = 0.5,
    a_outer: float = 2.0,
    b_outer: float = 1.0,
    noise: float = 0.05,
    d_model: int = 32,
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Generate 2D concentric ellipses dataset embedded in d_model space.

    Inner ellipse = class 0, outer ellipse = class 1.
    This is a linearly non-separable problem that tests zero-set geometry.

    Args:
        n_samples: Total number of samples
        a_inner/b_inner: Inner ellipse semi-axes
        a_outer/b_outer: Outer ellipse semi-axes
        noise: Gaussian noise level
        d_model: Embedding dimension

    Returns:
        X: (B, N=1, D) embedded points
        y: (B, N=1) class labels
        mask: (B, N=1) all True (no masking)
    """
    n_inner = n_samples // 2
    n_outer = n_samples - n_inner

    # Inner ellipse
    theta_inner = 2 * torch.pi * torch.rand(n_inner)
    x_inner = torch.stack([
        a_inner * torch.cos(theta_inner) + noise * torch.randn(n_inner),
        b_inner * torch.sin(theta_inner) + noise * torch.randn(n_inner)
    ], dim=1)

    # Outer ellipse
    theta_outer = 2 * torch.pi * torch.rand(n_outer)
    x_outer = torch.stack([
        a_outer * torch.cos(theta_outer) + noise * torch.randn(n_outer),
        b_outer * torch.sin(theta_outer) + noise * torch.randn(n_outer)
    ], dim=1)

    # Concatenate and label
    X_2d = torch.cat([x_inner, x_outer], dim=0)  # (B, 2)
    y = torch.cat([
        torch.zeros(n_inner, dtype=torch.long),
        torch.ones(n_outer, dtype=torch.long)
    ], dim=0)

    # Random embedding into d_model space
    torch.manual_seed(42)  # Reproducible embedding
    W_embed = torch.randn(2, d_model)
    X_embed = X_2d @ W_embed  # (B, D)

    # Reshape for transformer: (B, N=1, D)
    X = X_embed.unsqueeze(1)
    y = y.unsqueeze(1)
    mask = torch.ones_like(y, dtype=torch.bool)

    return X, y, mask


def evaluate_accuracy(
    model: ZetaBlockEnhanced,
    classifier: nn.Linear,
    dataset_fn: callable,
    device: str = "cuda"
) -> float:
    """
    Evaluate classification accuracy on a dataset.

    Args:
        model: Trained ZetaBlock
        classifier: Classification head
        dataset_fn: Function returning (X, y, mask)
        device: torch device

    Returns:
        Accuracy (0-1)
    """
    model.eval()
    classifier.eval()

    X, y, mask = dataset_fn()
    X, y = X.to(device), y.to(device)

    with torch.no_grad():
        out = model(X, return_components=False)
        logits = classifier(out)
        preds = logits.argmax(dim=-1)
        acc = (preds == y).float().mean().item()

    return acc


def compare_vanilla_vs_zeta_normalized(
    n_epochs: int = 20,
    device: str = "cuda" if torch.cuda.is_available() else "cpu",
    save_dir: str = "./zeta_comparison_results"
) -> None:
    """
    Train and compare vanilla ZetaBlock vs Zeta-normalized version.

    Demonstrates the impact of Zeta-normalization on:
    - Training convergence
    - Parameter stability
    - Generalization performance
    - κZeta convergence to critical line

    Args:
        n_epochs: Training epochs
        device: torch device
        save_dir: Directory to save results
    """
    import os
    os.makedirs(save_dir, exist_ok=True)

    print("="*80)
    print("Zeta-Normalization Comparison Experiment")
    print("="*80)
    print(f"Device: {device}")
    print(f"Epochs: {n_epochs}")
    print(f"Results will be saved to: {save_dir}")
    print()

    # Shared hyperparameters
    d_model = 32
    n_heads = 4
    batch_size = 64
    lr = 1e-3

    # Dataset generator
    def make_train_data():
        return make_ellipses_dataset(n_samples=2000, d_model=d_model)

    def make_test_data():
        return make_ellipses_dataset(n_samples=500, d_model=d_model)

    # ===== Vanilla model (no Zeta-normalization) =====
    print("\n[1/2] Training VANILLA ZetaBlock (Zeta-normalization disabled)...")
    print("-" * 80)

    model_vanilla, clf_vanilla, metrics_vanilla = train_zeta_block(
        make_dataset_fn=make_train_data,
        d_model=d_model,
        n_heads=n_heads,
        n_epochs=n_epochs,
        batch_size=batch_size,
        lr=lr,
        device=device,
        enable_zeta_norm=False,  # Disable Zeta-normalization
        kappa_strength=0.0,
        verbose=True,
        log_interval=2,
    )

    acc_vanilla = evaluate_accuracy(model_vanilla, clf_vanilla, make_test_data, device)
    print(f"\nVanilla model test accuracy: {acc_vanilla:.4f}")

    # ===== Zeta-normalized model =====
    print("\n[2/2] Training Zeta-NORMALIZED ZetaBlock (Zeta-normalization enabled)...")
    print("-" * 80)

    model_zeta, clf_zeta, metrics_zeta = train_zeta_block(
        make_dataset_fn=make_train_data,
        d_model=d_model,
        n_heads=n_heads,
        n_epochs=n_epochs,
        batch_size=batch_size,
        lr=lr,
        device=device,
        enable_zeta_norm=True,   # Enable Zeta-normalization
        kappa_strength=0.05,     # Feedback strength
        verbose=True,
        log_interval=2,
    )

    acc_zeta = evaluate_accuracy(model_zeta, clf_zeta, make_test_data, device)
    print(f"\nZeta-normalized model test accuracy: {acc_zeta:.4f}")

    # ===== Comparison summary =====
    print("\n" + "="*80)
    print("COMPARISON SUMMARY")
    print("="*80)

    summary_vanilla = metrics_vanilla.summary()
    summary_zeta = metrics_zeta.summary()

    print("\n| Metric                      | Vanilla       | Zeta-Normalized  | Improvement   |")
    print("|" + "-"*28 + "|" + "-"*15 + "|" + "-"*15 + "|" + "-"*15 + "|")

    # Test accuracy
    improvement_acc = (acc_zeta - acc_vanilla) * 100
    print(f"| Test Accuracy               | {acc_vanilla:>13.4f} | {acc_zeta:>13.4f} | {improvement_acc:>+12.2f}% |")

    # Loss reduction
    print(f"| Final Loss                  | {summary_vanilla['final_loss']:>13.4f} | {summary_zeta['final_loss']:>13.4f} | {(summary_zeta['final_loss'] - summary_vanilla['final_loss']):>+13.4f} |")

    # κZeta convergence (only meaningful for Zeta-normalized)
    kappa_conv_zeta = summary_zeta['kappa_convergence']
    print(f"| κZeta Convergence Rate         | {'N/A':>13s} | {kappa_conv_zeta:>13.6f} | {'—':>13s} |")

    # Parameter drift
    print(f"| β Drift                     | {summary_vanilla['beta_drift']:>13.4f} | {summary_zeta['beta_drift']:>13.4f} | {(summary_zeta['beta_drift'] - summary_vanilla['beta_drift']):>+13.4f} |")
    print(f"| t Drift                     | {summary_vanilla['t_drift']:>13.4f} | {summary_zeta['t_drift']:>13.4f} | {(summary_zeta['t_drift'] - summary_vanilla['t_drift']):>+13.4f} |")

    print("\n" + "="*80)

    # ===== Generate visualizations =====
    print("\nGenerating visualization dashboards...")

    print("\n  Creating Zeta-normalized model dashboard...")
    figs_zeta = create_full_dashboard(
        metrics_zeta,
        save_dir=os.path.join(save_dir, "zeta_normalized"),
        show=False
    )

    print("\n  Creating vanilla model dashboard (for comparison)...")
    figs_vanilla = create_full_dashboard(
        metrics_vanilla,
        save_dir=os.path.join(save_dir, "vanilla"),
        show=False
    )

    # Side-by-side comparison plot
    print("\n  Creating side-by-side comparison plot...")
    fig_compare = plot_multi_layer_kappa(
        models=[model_vanilla, model_zeta],
        labels=["Vanilla (no Zeta-norm)", "Zeta-Normalized"],
        figsize=(14, 6),
        save_path=os.path.join(save_dir, "model_comparison.png")
    )

    print("\n✓ All visualizations saved!")

    plt.close('all')  # Don't display, just save

    # ===== Save numerical results =====
    results_file = os.path.join(save_dir, "results_summary.txt")
    with open(results_file, 'w') as f:
        f.write("Zeta-NORMALIZATION EXPERIMENT RESULTS\n")
        f.write("="*80 + "\n\n")

        f.write("CONFIGURATION\n")
        f.write("-"*80 + "\n")
        f.write(f"d_model: {d_model}\n")
        f.write(f"n_heads: {n_heads}\n")
        f.write(f"n_epochs: {n_epochs}\n")
        f.write(f"batch_size: {batch_size}\n")
        f.write(f"lr: {lr}\n")
        f.write(f"kappa_strength: 0.05\n\n")

        f.write("RESULTS\n")
        f.write("-"*80 + "\n")
        f.write(f"Vanilla Test Accuracy:      {acc_vanilla:.4f}\n")
        f.write(f"Zeta-Normalized Test Accuracy: {acc_zeta:.4f}\n")
        f.write(f"Improvement:                {improvement_acc:+.2f}%\n\n")

        f.write("VANILLA MODEL SUMMARY\n")
        f.write("-"*80 + "\n")
        for key, val in summary_vanilla.items():
            f.write(f"{key:30s}: {val:.6f}\n")

        f.write("\nZeta-NORMALIZED MODEL SUMMARY\n")
        f.write("-"*80 + "\n")
        for key, val in summary_zeta.items():
            f.write(f"{key:30s}: {val:.6f}\n")

    print(f"\n✓ Numerical results saved to: {results_file}")

    # ===== Save trained models =====
    print("\n" + "="*80)
    print("Saving Trained Models")
    print("="*80)

    from training_loop_enhanced import save_zeta_model

    # Save vanilla model
    vanilla_path = os.path.join(save_dir, "vanilla", "model_checkpoint.pt")
    save_zeta_model(
        model_vanilla, clf_vanilla, metrics_vanilla,
        vanilla_path,
        hyperparameters={
            'd_model': d_model,
            'n_heads': n_heads,
            'n_epochs': n_epochs,
            'batch_size': batch_size,
            'lr': lr,
            'enable_zeta_norm': False,
        }
    )

    # Save zeta-normalized model
    zeta_path = os.path.join(save_dir, "zeta_normalized", "model_checkpoint.pt")
    save_zeta_model(
        model_zeta, clf_zeta, metrics_zeta,
        zeta_path,
        hyperparameters={
            'd_model': d_model,
            'n_heads': n_heads,
            'n_epochs': n_epochs,
            'batch_size': batch_size,
            'lr': lr,
            'enable_zeta_norm': True,
            'kappa_strength': 0.05,
        }
    )

    print(f"\nResults directory: {save_dir}")
    print("  - vanilla/: Vanilla model diagnostics + checkpoint")
    print("  - zeta_normalized/: Zeta-normalized model diagnostics + checkpoint")
    print("  - model_comparison.png: Side-by-side κZeta comparison")

    print("\n" + "="*80)
    print("Experiment complete!")
    print("="*80 + "\n")


def quick_demo(n_epochs: int = 5) -> None:
    """
    Quick demonstration of Zeta-normalization (minimal epochs, for testing).

    Args:
        n_epochs: Number of training epochs (default: 5 for speed)
    """
    print("="*80)
    print("Quick Zeta-Normalization Demo")
    print("="*80)

    device = "cuda" if torch.cuda.is_available() else "cpu"

    def make_data():
        return make_ellipses_dataset(n_samples=1000, d_model=32)

    print(f"\nTraining with Zeta-normalization enabled (device: {device})...\n")

    model, classifier, metrics = train_zeta_block(
        make_dataset_fn=make_data,
        d_model=32,
        n_heads=4,
        n_epochs=n_epochs,
        batch_size=64,
        lr=1e-3,
        device=device,
        enable_zeta_norm=True,
        kappa_strength=0.05,
        verbose=True,
    )

    # Show κZeta statistics
    kappa_stats = model.get_kappa_stats()
    print("\nκZeta Statistics:")
    print("-" * 40)
    for key, val in kappa_stats.items():
        if key != "history":
            print(f"  {key:20s}: {val:.6f}")

    # Quick visualization
    from zeta_visualization import plot_kappa_evolution
    print("\nGenerating κZeta evolution plot...")
    fig = plot_kappa_evolution(metrics)
    plt.show()

    print("\nDemo complete!")


if __name__ == "__main__":
    import sys

    # Usage:
    # python example_zeta_normalization.py           -> full comparison
    # python example_zeta_normalization.py demo      -> quick demo
    # python example_zeta_normalization.py quick     -> quick demo (alias)

    if len(sys.argv) > 1 and sys.argv[1] in ["demo", "quick"]:
        print("Running quick demo mode...\n")
        quick_demo(n_epochs=5)
    else:
        print("Running full comparison experiment...\n")
        compare_vanilla_vs_zeta_normalized(
            n_epochs=200,
            save_dir="./zeta_comparison_results"
        )