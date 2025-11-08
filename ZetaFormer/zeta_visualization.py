"""
Visualization utilities for ζ-normalization monitoring and analysis.

This module provides comprehensive visualization tools for:
1. κζ (kappa_zeta) evolution during training
2. Poisson parameter (β, t) dynamics
3. Loss component decomposition
4. Convergence diagnostics to critical line
5. Multi-layer κζ comparison (for stacked models)

Features:
- Real-time training monitoring plots
- Post-training analysis dashboards
- Critical line convergence visualization
- Parameter space trajectories
- Statistical diagnostics

Author: Enhanced by Claude for Noetic Eidos Project
License: MIT
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from typing import List, Optional, Dict, Tuple
import torch

from training_loop_enhanced import ZetaTrainingMetrics
from zeta_block_enhanced import ZetaBlockEnhanced


def plot_kappa_evolution(
    metrics: ZetaTrainingMetrics,
    window: int = 50,
    figsize: Tuple[int, int] = (14, 10),
    save_path: Optional[str] = None,
) -> plt.Figure:
    """
    Plot κζ evolution with two-stage smoothing (raw + calibrated + offset).

    Args:
        metrics: Training metrics object
        window: Smoothing window for rolling average
        figsize: Figure size (width, height)
        save_path: Optional path to save figure

    Returns:
        matplotlib Figure object
    """
    fig = plt.figure(figsize=figsize)
    gs = GridSpec(2, 2, figure=fig, hspace=0.3, wspace=0.3)

    # Flatten κζ values (calibrated)
    kappa_flat = [k for epoch in metrics.epoch_kappa for k in epoch]
    if not kappa_flat:
        print("Warning: No κζ data available")
        return fig

    kappa_array = np.array(kappa_flat)
    x = np.arange(len(kappa_array))

    # Flatten raw κζ and offset
    kappa_raw_flat = [k for epoch in metrics.epoch_kappa_raw for k in epoch]
    offset_flat = [k for epoch in metrics.epoch_offset for k in epoch]
    kappa_raw_array = np.array(kappa_raw_flat) if kappa_raw_flat else kappa_array
    offset_array = np.array(offset_flat) if offset_flat else np.zeros_like(kappa_array)

    # Top-left: Raw vs Calibrated κζ
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.plot(x, kappa_raw_array, alpha=0.3, color='gray', label='κζ_raw (science)', linewidth=1)
    ax1.plot(x, kappa_array, alpha=0.5, color='steelblue', label='κζ_calibrated (control)', linewidth=1.5)

    # Rolling average for calibrated
    if len(kappa_array) > window:
        smooth = np.convolve(kappa_array, np.ones(window)/window, mode='valid')
        x_smooth = np.arange(window//2, window//2 + len(smooth))
        ax1.plot(x_smooth, smooth, color='darkblue', linewidth=2, label=f'Smoothed (α=0.1)', zorder=10)

    ax1.axhline(0, color='red', linestyle='--', alpha=0.5, label='Critical line (κζ=0)', zorder=5)
    ax1.set_xlabel('Batch iteration')
    ax1.set_ylabel('κζ (zeta curvature)')
    ax1.set_title('Two-Stage κζ Evolution: Raw vs Calibrated')
    ax1.legend(loc='best', fontsize=8)
    ax1.grid(alpha=0.3)

    # Top-right: Offset dynamics (m* evolution)
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.plot(x, offset_array, color='orange', linewidth=2, label='Offset m* (EMA α=0.01)')

    # Show final converged value
    if len(offset_array) > 0:
        final_offset = offset_array[-1]
        ax2.axhline(final_offset, color='orange', linestyle='--', alpha=0.5,
                    label=f'Final m* = {final_offset:.4f}')

    ax2.set_xlabel('Batch iteration')
    ax2.set_ylabel('Offset m*')
    ax2.set_title('Global Scale Offset Evolution (Slow EMA)')
    ax2.legend(loc='best', fontsize=8)
    ax2.grid(alpha=0.3)

    # Bottom-left: Calibrated κζ distribution
    ax3 = fig.add_subplot(gs[1, 0])
    ax3.hist(kappa_array, bins=50, alpha=0.7, color='steelblue', edgecolor='black', label='κζ_cal')
    ax3.axvline(0, color='red', linestyle='--', linewidth=2, label='Critical line')
    ax3.axvline(np.mean(kappa_array), color='darkblue', linestyle='--', linewidth=2, label=f'Mean={np.mean(kappa_array):.3f}')
    ax3.set_xlabel('κζ_calibrated value')
    ax3.set_ylabel('Frequency')
    ax3.set_title('Calibrated κζ Distribution (Control Signal)')
    ax3.legend(loc='best', fontsize=8)
    ax3.grid(alpha=0.3)

    # Bottom-right: Raw κζ distribution
    ax4 = fig.add_subplot(gs[1, 1])
    ax4.hist(kappa_raw_array, bins=50, alpha=0.7, color='gray', edgecolor='black', label='κζ_raw')
    ax4.axvline(np.mean(kappa_raw_array), color='black', linestyle='--', linewidth=2,
                label=f'Mean={np.mean(kappa_raw_array):.3f}')
    ax4.set_xlabel('κζ_raw value')
    ax4.set_ylabel('Frequency')
    ax4.set_title('Raw κζ Distribution (Global Scale)')
    ax4.legend(loc='best', fontsize=8)
    ax4.grid(alpha=0.3)

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Figure saved to {save_path}")

    return fig


def plot_parameter_dynamics(
    metrics: ZetaTrainingMetrics,
    figsize: Tuple[int, int] = (14, 5),
    save_path: Optional[str] = None,
) -> plt.Figure:
    """
    Plot Poisson parameter (β, t) evolution and trajectories.

    Args:
        metrics: Training metrics object
        figsize: Figure size (width, height)
        save_path: Optional path to save figure

    Returns:
        matplotlib Figure object
    """
    if len(metrics.epoch_beta) == 0:
        print("Warning: No parameter data available")
        return plt.figure()

    fig, axes = plt.subplots(1, 3, figsize=figsize)

    n_epochs = len(metrics.epoch_beta)
    n_heads = metrics.epoch_beta[0].shape[0]
    epochs = np.arange(n_epochs)

    # Beta evolution
    ax = axes[0]
    beta_array = np.array(metrics.epoch_beta)  # (n_epochs, n_heads)
    for h in range(n_heads):
        ax.plot(epochs, beta_array[:, h], marker='o', label=f'Head {h}', alpha=0.7)
    ax.set_xlabel('Epoch')
    ax.set_ylabel('β (scale parameter)')
    ax.set_title('β Evolution per Head')
    ax.legend()
    ax.grid(alpha=0.3)

    # t evolution
    ax = axes[1]
    t_array = np.array(metrics.epoch_t)  # (n_epochs, n_heads)
    for h in range(n_heads):
        ax.plot(epochs, t_array[:, h], marker='s', label=f'Head {h}', alpha=0.7)
    ax.set_xlabel('Epoch')
    ax.set_ylabel('t (offset parameter)')
    ax.set_title('t Evolution per Head')
    ax.legend()
    ax.grid(alpha=0.3)

    # Parameter space trajectory (first head)
    ax = axes[2]
    beta_h0 = beta_array[:, 0]
    t_h0 = t_array[:, 0]

    # Color by epoch
    scatter = ax.scatter(beta_h0, t_h0, c=epochs, cmap='viridis', s=50, alpha=0.7, edgecolors='black')
    ax.plot(beta_h0, t_h0, 'k-', alpha=0.3, linewidth=1)

    # Mark start and end
    ax.scatter(beta_h0[0], t_h0[0], color='green', s=200, marker='*', edgecolors='black', label='Start', zorder=5)
    ax.scatter(beta_h0[-1], t_h0[-1], color='red', s=200, marker='*', edgecolors='black', label='End', zorder=5)

    ax.set_xlabel('β')
    ax.set_ylabel('t')
    ax.set_title('Parameter Trajectory (Head 0)')
    ax.legend()
    ax.grid(alpha=0.3)

    cbar = plt.colorbar(scatter, ax=ax)
    cbar.set_label('Epoch')

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Figure saved to {save_path}")

    return fig


def plot_loss_decomposition(
    metrics: ZetaTrainingMetrics,
    figsize: Tuple[int, int] = (12, 5),
    save_path: Optional[str] = None,
) -> plt.Figure:
    """
    Plot loss components over training epochs.

    Args:
        metrics: Training metrics object
        figsize: Figure size (width, height)
        save_path: Optional path to save figure

    Returns:
        matplotlib Figure object
    """
    if len(metrics.epoch_loss) == 0:
        print("Warning: No loss data available")
        return plt.figure()

    fig, axes = plt.subplots(1, 2, figsize=figsize)

    epochs = np.arange(len(metrics.epoch_loss))

    # Left: All losses on same plot
    ax = axes[0]
    ax.plot(epochs, metrics.epoch_loss, marker='o', label='Total Loss', linewidth=2)
    ax.plot(epochs, metrics.epoch_task_loss, marker='s', label='Task Loss', linewidth=2, alpha=0.7)
    ax.plot(epochs, metrics.epoch_zero_loss, marker='^', label='Zero-set Loss', linewidth=2, alpha=0.7)
    ax.set_xlabel('Epoch')
    ax.set_ylabel('Loss')
    ax.set_title('Loss Components Over Training')
    ax.legend()
    ax.grid(alpha=0.3)
    ax.set_yscale('log')

    # Right: Loss ratios
    ax = axes[1]
    total = np.array(metrics.epoch_loss)
    task = np.array(metrics.epoch_task_loss)
    zero = np.array(metrics.epoch_zero_loss)

    # Compute fractions (handle division by zero)
    with np.errstate(divide='ignore', invalid='ignore'):
        task_frac = task / total
        zero_frac = zero / total
        task_frac = np.nan_to_num(task_frac, nan=0.0, posinf=0.0, neginf=0.0)
        zero_frac = np.nan_to_num(zero_frac, nan=0.0, posinf=0.0, neginf=0.0)

    ax.stackplot(epochs, task_frac, zero_frac, labels=['Task', 'Zero-set'], alpha=0.7)
    ax.set_xlabel('Epoch')
    ax.set_ylabel('Loss Fraction')
    ax.set_title('Relative Loss Components')
    ax.legend(loc='upper right')
    ax.grid(alpha=0.3)
    ax.set_ylim(0, 1)

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Figure saved to {save_path}")

    return fig


def plot_convergence_diagnostics(
    metrics: ZetaTrainingMetrics,
    figsize: Tuple[int, int] = (14, 8),
    save_path: Optional[str] = None,
) -> plt.Figure:
    """
    Comprehensive convergence diagnostics dashboard.

    Shows:
    - κζ convergence to critical line
    - Parameter drift magnitudes
    - Loss reduction
    - Statistical stability

    Args:
        metrics: Training metrics object
        figsize: Figure size (width, height)
        save_path: Optional path to save figure

    Returns:
        matplotlib Figure object
    """
    fig = plt.figure(figsize=figsize)
    gs = GridSpec(3, 2, figure=fig, hspace=0.3, wspace=0.3)

    # Flatten data
    kappa_flat = [k for epoch in metrics.epoch_kappa for k in epoch]
    if not kappa_flat:
        print("Warning: No data available for diagnostics")
        return fig

    kappa_array = np.array(kappa_flat)

    # 1. κζ convergence to zero
    ax1 = fig.add_subplot(gs[0, :])
    window = min(100, len(kappa_array) // 5)
    if window > 1:
        abs_kappa = np.abs(kappa_array)
        smooth = np.convolve(abs_kappa, np.ones(window)/window, mode='valid')
        x_smooth = np.arange(window//2, window//2 + len(smooth))
        ax1.plot(x_smooth, smooth, color='darkred', linewidth=2, label='|κζ| (smoothed)')
    ax1.plot(np.abs(kappa_array), alpha=0.2, color='red', label='|κζ| (raw)')
    ax1.set_xlabel('Batch iteration')
    ax1.set_ylabel('|κζ| (distance from critical line)')
    ax1.set_title('Convergence to Critical Line (|κζ| → 0)')
    ax1.set_yscale('log')
    ax1.legend()
    ax1.grid(alpha=0.3)

    # 2. κζ gradient (rate of change)
    ax2 = fig.add_subplot(gs[1, 0])
    grad_kappa = np.abs(np.gradient(kappa_array))
    ax2.plot(grad_kappa, alpha=0.5, color='purple')
    if len(grad_kappa) > window:
        smooth_grad = np.convolve(grad_kappa, np.ones(window)/window, mode='valid')
        x_smooth = np.arange(window//2, window//2 + len(smooth_grad))
        ax2.plot(x_smooth, smooth_grad, color='darkviolet', linewidth=2)
    ax2.set_xlabel('Batch iteration')
    ax2.set_ylabel('|dκζ/dt|')
    ax2.set_title('κζ Change Rate (convergence speed)')
    ax2.set_yscale('log')
    ax2.grid(alpha=0.3)

    # 3. Parameter drift
    ax3 = fig.add_subplot(gs[1, 1])
    if len(metrics.epoch_beta) > 1:
        beta_array = np.array(metrics.epoch_beta)
        t_array = np.array(metrics.epoch_t)
        epochs = np.arange(len(beta_array))

        # Compute per-epoch drift from initial
        beta_drift = np.linalg.norm(beta_array - beta_array[0], axis=1)
        t_drift = np.linalg.norm(t_array - t_array[0], axis=1)

        ax3.plot(epochs, beta_drift, marker='o', label='β drift', linewidth=2)
        ax3.plot(epochs, t_drift, marker='s', label='t drift', linewidth=2)
        ax3.set_xlabel('Epoch')
        ax3.set_ylabel('L2 drift from initial')
        ax3.set_title('Poisson Parameter Drift')
        ax3.legend()
        ax3.grid(alpha=0.3)

    # 4. Loss reduction curve
    ax4 = fig.add_subplot(gs[2, 0])
    if metrics.epoch_loss:
        epochs = np.arange(len(metrics.epoch_loss))
        ax4.plot(epochs, metrics.epoch_loss, marker='o', color='darkgreen', linewidth=2)
        ax4.set_xlabel('Epoch')
        ax4.set_ylabel('Total Loss')
        ax4.set_title('Loss Reduction Curve')
        ax4.set_yscale('log')
        ax4.grid(alpha=0.3)

    # 5. Statistical summary table
    ax5 = fig.add_subplot(gs[2, 1])
    ax5.axis('off')

    summary = metrics.summary()
    summary_text = "Training Summary\n" + "="*40 + "\n"
    for key, val in summary.items():
        summary_text += f"{key:25s}: {val:>10.4f}\n"

    # Add κζ statistics
    summary_text += "\nκζ Statistics\n" + "="*40 + "\n"
    summary_text += f"{'Mean':25s}: {np.mean(kappa_array):>10.4f}\n"
    summary_text += f"{'Std Dev':25s}: {np.std(kappa_array):>10.4f}\n"
    summary_text += f"{'Min':25s}: {np.min(kappa_array):>10.4f}\n"
    summary_text += f"{'Max':25s}: {np.max(kappa_array):>10.4f}\n"
    summary_text += f"{'Final 100 mean':25s}: {np.mean(kappa_array[-100:]):>10.4f}\n"

    ax5.text(0.1, 0.9, summary_text, fontfamily='monospace', fontsize=9,
             verticalalignment='top', transform=ax5.transAxes)

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Figure saved to {save_path}")

    return fig


def plot_multi_layer_kappa(
    models: List[ZetaBlockEnhanced],
    labels: Optional[List[str]] = None,
    figsize: Tuple[int, int] = (12, 6),
    save_path: Optional[str] = None,
) -> plt.Figure:
    """
    Compare κζ evolution across multiple layers or models.

    Useful for analyzing stacked ZetaBlocks or comparing different configurations.

    Args:
        models: List of ZetaBlockEnhanced instances
        labels: Optional labels for each model
        figsize: Figure size (width, height)
        save_path: Optional path to save figure

    Returns:
        matplotlib Figure object
    """
    if labels is None:
        labels = [f"Layer {i}" for i in range(len(models))]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)

    # Left: κζ histories
    for i, (model, label) in enumerate(zip(models, labels)):
        if hasattr(model, 'kappa_log') and len(model.kappa_log) > 0:
            ax1.plot(model.kappa_log, alpha=0.7, label=label, linewidth=2)

    ax1.axhline(0, color='red', linestyle='--', alpha=0.5, label='Critical line')
    ax1.set_xlabel('Forward pass iteration')
    ax1.set_ylabel('κζ')
    ax1.set_title('Multi-Layer κζ Evolution')
    ax1.legend()
    ax1.grid(alpha=0.3)

    # Right: κζ distribution comparison
    for i, (model, label) in enumerate(zip(models, labels)):
        if hasattr(model, 'kappa_log') and len(model.kappa_log) > 0:
            ax2.hist(model.kappa_log, bins=30, alpha=0.5, label=label)

    ax2.axvline(0, color='red', linestyle='--', linewidth=2, label='Critical line')
    ax2.set_xlabel('κζ value')
    ax2.set_ylabel('Frequency')
    ax2.set_title('κζ Distribution Comparison')
    ax2.legend()
    ax2.grid(alpha=0.3)

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Figure saved to {save_path}")

    return fig


def create_full_dashboard(
    metrics: ZetaTrainingMetrics,
    save_dir: Optional[str] = None,
    show: bool = True,
) -> Dict[str, plt.Figure]:
    """
    Generate complete visualization dashboard with all diagnostic plots.

    Args:
        metrics: Training metrics object
        save_dir: Optional directory to save all figures
        show: Whether to display figures

    Returns:
        Dictionary mapping plot names to Figure objects
    """
    import os

    # Create save directory if specified
    if save_dir:
        os.makedirs(save_dir, exist_ok=True)

    figures = {}

    # Create all plots
    print("Generating ζ-normalization visualization dashboard...")

    print("  [1/4] κζ evolution...")
    fig1 = plot_kappa_evolution(
        metrics,
        save_path=os.path.join(save_dir, "kappa_evolution.png") if save_dir else None
    )
    figures["kappa_evolution"] = fig1

    print("  [2/4] Parameter dynamics...")
    fig2 = plot_parameter_dynamics(
        metrics,
        save_path=os.path.join(save_dir, "parameter_dynamics.png") if save_dir else None
    )
    figures["parameter_dynamics"] = fig2

    print("  [3/4] Loss decomposition...")
    fig3 = plot_loss_decomposition(
        metrics,
        save_path=os.path.join(save_dir, "loss_decomposition.png") if save_dir else None
    )
    figures["loss_decomposition"] = fig3

    print("  [4/4] Convergence diagnostics...")
    fig4 = plot_convergence_diagnostics(
        metrics,
        save_path=os.path.join(save_dir, "convergence_diagnostics.png") if save_dir else None
    )
    figures["convergence_diagnostics"] = fig4

    print("Dashboard generation complete!")

    if show:
        plt.show()

    return figures