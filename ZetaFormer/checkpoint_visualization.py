"""
Checkpoint Visualization Module for ZetaFormer

Provides comprehensive visualization capabilities for trained model checkpoints:
- CGD decision boundary plots
- Polylipse dataset geometry
- Model embeddings and representations
- Training metrics history
- Attention patterns and Poisson parameters

Author: Enhanced for Noetic Eidos Project
License: MIT
"""

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Optional, Dict, List, Tuple, Union
import warnings

# Import ZetaFormer components
from zeta_block_enhanced import ZetaBlockEnhanced
from polylipse_dataset import make_polylipse_dataset, make_circle_dataset
from polylipse_visualization import (
    plot_cgd_polylipse,
    plot_polylipse_2d,
    gaussian_kernel_from_points,
    poisson_kernel_from_points,
    build_dual_kernel_operator,
    fit_cgd_polylipse,
    predict_cgd_scores,
    cg_solve
)


class CheckpointVisualizer:
    """
    Comprehensive visualization toolkit for ZetaFormer checkpoints.

    Loads a checkpoint and provides methods to generate:
    - CGD decision boundary plots
    - Polylipse dataset geometry
    - Model embeddings/representations
    - Training metrics history
    - Curriculum progression analysis

    Example:
        viz = CheckpointVisualizer("level_3_checkpoint.pt")
         viz.plot_cgd_decision_boundary(save_path="cgd_level_3.png")
         viz.plot_training_history(save_path="history_level_3.png")
         viz.generate_full_report(output_dir="./viz_level_3/")
    """

    def __init__(self, checkpoint_path: str, device: Optional[str] = None):
        """
        Load checkpoint and initialize visualizer.

        Args:
            checkpoint_path: Path to .pt checkpoint file
            device: Device to load model on ('cuda', 'cpu', or None for auto)
        """
        self.checkpoint_path = Path(checkpoint_path)

        if not self.checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

        # Auto-detect device if not specified
        if device is None:
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        else:
            self.device = device

        # Load checkpoint
        print(f"Loading checkpoint from {self.checkpoint_path}...")
        self.checkpoint = torch.load(self.checkpoint_path, map_location=self.device)

        # Validate and extract metadata
        self._validate_checkpoint()
        self._extract_metadata()

        # Reconstruct model
        self.model, self.classifier = self._reconstruct_model()

        # Reconstruct dataset
        self.dataset = self._reconstruct_dataset()

        print(f"✓ Loaded checkpoint: Level {self.n_foci}, κζ={self.stabilized_kappa:.4f}")

    def _validate_checkpoint(self) -> None:
        """Validate checkpoint has required fields."""
        required_keys = ['model_state_dict', 'classifier_state_dict', 'dataset_config']

        # Check for enhanced format
        if all(key in self.checkpoint for key in required_keys):
            self.checkpoint_version = self.checkpoint.get('metadata', {}).get('version', '1.0.0')
            return

        # Check for legacy format (minimal)
        legacy_keys = ['model_state', 'classifier_state', 'n_foci']
        if all(key in self.checkpoint for key in legacy_keys):
            warnings.warn(
                "Legacy checkpoint format detected. Some visualization features may be limited. "
                "Consider re-running training to generate enhanced checkpoints.",
                UserWarning
            )
            self._upgrade_legacy_checkpoint()
            return

        raise ValueError(
            f"Invalid checkpoint format. Required keys: {required_keys} "
            f"or legacy keys: {legacy_keys}"
        )

    def _upgrade_legacy_checkpoint(self) -> None:
        """Convert legacy checkpoint format to enhanced format."""
        # Map legacy keys to enhanced format
        enhanced = {
            'model_state_dict': self.checkpoint.get('model_state', {}),
            'classifier_state_dict': self.checkpoint.get('classifier_state', {}),
            'model_config': {},  # Unknown - will use defaults
            'dataset_config': {
                'n_foci': self.checkpoint['n_foci'],
                'stabilized_kappa': self.checkpoint.get('stabilized_kappa', 1.0),
                'focal_angles': None,
                'focal_weights': None,
                'focal_centers': None,
            },
            'curriculum_info': {},
            'metrics': {},
            'viz_config': {
                'cgd_sigma': 0.5,
                'cgd_t': 0.5,
                'cgd_w': 0.5,
                'cgd_eta': 1e-2,
                'grid_resolution': 220,
            },
            'metadata': {'version': '0.9.0'}
        }
        self.checkpoint = enhanced
        self.is_legacy = True

    def _extract_metadata(self) -> None:
        """Extract commonly used metadata from checkpoint."""
        self.is_legacy = getattr(self, 'is_legacy', False)

        # Dataset config
        dataset_cfg = self.checkpoint.get('dataset_config', {})
        self.n_foci = dataset_cfg.get('n_foci', 1)
        self.stabilized_kappa = dataset_cfg.get('stabilized_kappa', 1.0)
        self.observed_kappa = dataset_cfg.get('observed_kappa', self.stabilized_kappa)

        # Model config
        model_cfg = self.checkpoint.get('model_config', {})
        self.d_model = model_cfg.get('d_model', 32)
        self.n_heads = model_cfg.get('n_heads', 4)
        self.enable_zeta_norm = model_cfg.get('enable_zeta_norm', True)

        # Curriculum info
        curr_info = self.checkpoint.get('curriculum_info', {})
        self.level = curr_info.get('level', self.n_foci)
        self.is_stable = curr_info.get('is_stable', False)

        # Viz config
        self.viz_config = self.checkpoint.get('viz_config', {
            'cgd_sigma': 0.5, 'cgd_t': 0.5, 'cgd_w': 0.5,
            'cgd_eta': 1e-2, 'grid_resolution': 220
        })

    def _reconstruct_model(self) -> Tuple[ZetaBlockEnhanced, nn.Linear]:
        """Reconstruct model from checkpoint weights."""
        # Create model architecture
        model = ZetaBlockEnhanced(
            d_model=self.d_model,
            n_heads=self.n_heads,
            enable_zeta_norm=self.enable_zeta_norm,
            kappa_strength=self.checkpoint.get('model_config', {}).get('kappa_strength', 0.05)
        ).to(self.device)

        # Load weights
        model.load_state_dict(self.checkpoint['model_state_dict'])
        model.eval()

        # Create classifier
        n_classes = self.checkpoint.get('metadata', {}).get('n_classes', self.n_foci)
        classifier = nn.Linear(self.d_model, n_classes).to(self.device)
        classifier.load_state_dict(self.checkpoint['classifier_state_dict'])
        classifier.eval()

        return model, classifier

    def _reconstruct_dataset(self) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Regenerate dataset using saved geometry.

        Returns:
            X, y, mask: Dataset tensors
        """
        dataset_cfg = self.checkpoint['dataset_config']

        if self.n_foci == 1:
            X, y, mask = make_circle_dataset(
                n_samples=dataset_cfg.get('n_samples', 1000),
                d_model=self.d_model
            )
        else:
            X, y, mask = make_polylipse_dataset(
                n_foci=self.n_foci,
                observed_kappa=self.observed_kappa,
                n_samples=dataset_cfg.get('n_samples', 1000),
                focal_radius=dataset_cfg.get('focal_radius', 2.0),
                orbit_radius=dataset_cfg.get('orbit_radius', 0.5),
                orbit_std=dataset_cfg.get('orbit_std', 0.3),
                noise=dataset_cfg.get('noise', 0.05),
                d_model=self.d_model
            )

        return X.to(self.device), y.to(self.device), mask.to(self.device)

    # ============================================================================
    # Visualization Methods
    # ============================================================================

    def plot_cgd_decision_boundary(
        self,
        sigma: Optional[float] = None,
        t: Optional[float] = None,
        w: Optional[float] = None,
        eta: Optional[float] = None,
        grid_resolution: Optional[int] = None,
        n_samples: Optional[int] = None,
        figsize: Optional[Tuple[int, int]] = None,
        title: Optional[str] = None,
        save_path: Optional[str] = None,
        dpi: Optional[int] = None
    ) -> plt.Figure:
        """
        Generate CGD decision boundary visualization.

        Uses dual-kernel (Gaussian-Poisson) solver to show learned boundaries.

        Args:
            sigma: Gaussian bandwidth (default from checkpoint)
            t: Poisson scale (default from checkpoint)
            w: Mellin mix weight (default from checkpoint)
            eta: Regularization strength (default from checkpoint)
            grid_resolution: Grid size (default from checkpoint)
            n_samples: Number of samples for CGD solver (default 800)
            figsize: Figure size (default None)
            title: Plot title (auto-generated if None)
            save_path: Where to save plot (None = display only)
            dpi: DPI for saved figure (default None)

        Returns:
            matplotlib Figure object
        """
        # Use checkpoint defaults if not specified
        sigma = sigma or self.viz_config.get('cgd_sigma', 0.5)
        t = t or self.viz_config.get('cgd_t', 0.5)
        w = w or self.viz_config.get('cgd_w', 0.5)
        eta = eta or self.viz_config.get('cgd_eta', 1e-2)
        grid_resolution = grid_resolution or self.viz_config.get('grid_resolution', 220)
        n_samples = n_samples or 800

        if title is None:
            title = (f"CGD Decision Boundary: Level {self.level} ({self.n_foci}-Focal)\n"
                    f"κζ={self.stabilized_kappa:.3f}")

        # Use polylipse_visualization function
        fig, f, info = plot_cgd_polylipse(
            n_foci=self.n_foci,
            observed_kappa=self.observed_kappa,
            n_samples=n_samples,
            sigma=sigma,
            t=t,
            w=w,
            eta=eta,
            grid_resolution=grid_resolution,
            title=title,
            save_path=save_path
        )

        return fig

    def plot_polylipse_geometry(
        self,
        show_focal_info: bool = True,
        title: Optional[str] = None,
        save_path: Optional[str] = None,
        dpi: Optional[int] = None
    ) -> plt.Figure:
        """
        Visualize polylipse dataset geometry.

        Shows data points, focal centers, and configuration parameters.

        Args:
            show_focal_info: Display focal configuration text box
            title: Plot title (auto-generated if None)
            save_path: Where to save plot
            dpi: DPI for saved figure (default None)

        Returns:
            matplotlib Figure object
        """
        if title is None:
            title = f"Level {self.level}: {self.n_foci}-Focal Geometry (κζ={self.stabilized_kappa:.3f})"

        fig = plot_polylipse_2d(
            n_foci=self.n_foci,
            observed_kappa=self.observed_kappa,
            n_samples=1000,
            show_focal_info=show_focal_info,
            title=title,
            save_path=save_path
        )

        if save_path and dpi:
            # Re-save with specified DPI
            fig.savefig(save_path, dpi=dpi, bbox_inches='tight')

        return fig

    def plot_training_history(
        self,
        metrics: List[str] = ["loss", "kappa_raw", "offset"],
        figsize: Tuple[int, int] = (14, 8),
        save_path: Optional[str] = None,
        dpi: Optional[int] = None
    ) -> plt.Figure:
        """
        Plot training metrics evolution.

        Args:
            metrics: Which metrics to plot ("loss", "kappa", "kappa_raw", "offset", "beta", "t")
            figsize: Figure size
            save_path: Where to save plot
            dpi: DPI for saved figure (default None)

        Returns:
            matplotlib Figure object
        """
        checkpoint_metrics = self.checkpoint.get('metrics', {})

        if not checkpoint_metrics:
            print("Warning: No metrics found in checkpoint")
            return plt.figure()

        n_metrics = len(metrics)
        fig, axes = plt.subplots(n_metrics, 1, figsize=figsize, sharex=True)
        if n_metrics == 1:
            axes = [axes]

        for ax, metric_name in zip(axes, metrics):
            if metric_name == "loss":
                data = checkpoint_metrics.get('epoch_loss', [])
                ax.plot(data, linewidth=2, color='steelblue')
                ax.set_ylabel('Loss', fontsize=12)
                ax.set_title('Training Loss', fontsize=13, fontweight='bold')

            elif metric_name == "kappa":
                data = [k for epoch in checkpoint_metrics.get('epoch_kappa', []) for k in epoch]
                ax.plot(data, linewidth=2, color='darkgreen', alpha=0.7)
                ax.set_ylabel('κζ (calibrated)', fontsize=12)
                ax.set_title('κζ Evolution (Calibrated)', fontsize=13, fontweight='bold')
                ax.axhline(0, color='black', linestyle='--', linewidth=1, alpha=0.3)

            elif metric_name == "kappa_raw":
                data = [k for epoch in checkpoint_metrics.get('epoch_kappa_raw', []) for k in epoch]
                ax.plot(data, linewidth=2, color='darkred', alpha=0.7)
                ax.set_ylabel('κζ (raw)', fontsize=12)
                ax.set_title('κζ Evolution (Raw M_τ/M_σ)', fontsize=13, fontweight='bold')
                ax.axhline(self.stabilized_kappa, color='black', linestyle='--',
                          linewidth=1, alpha=0.5, label=f'Final κζ={self.stabilized_kappa:.3f}')
                ax.legend()

            elif metric_name == "offset":
                data = [o for epoch in checkpoint_metrics.get('epoch_offset', []) for o in epoch]
                ax.plot(data, linewidth=2, color='purple', alpha=0.7)
                ax.set_ylabel('ζ-offset', fontsize=12)
                ax.set_title('ζ-Normalization Offset', fontsize=13, fontweight='bold')

            elif metric_name == "beta":
                data = checkpoint_metrics.get('epoch_beta', [])
                if data and len(data) > 0:
                    # Plot mean β across heads
                    beta_means = [np.mean(b) for b in data if len(b) > 0]
                    ax.plot(beta_means, linewidth=2, color='orange', alpha=0.7)
                    ax.set_ylabel('β (mean)', fontsize=12)
                    ax.set_title('Poisson Scale Parameter (β)', fontsize=13, fontweight='bold')

            elif metric_name == "t":
                data = checkpoint_metrics.get('epoch_t', [])
                if data and len(data) > 0:
                    # Plot mean t across heads
                    t_means = [np.mean(t) for t in data if len(t) > 0]
                    ax.plot(t_means, linewidth=2, color='brown', alpha=0.7)
                    ax.set_ylabel('t (mean)', fontsize=12)
                    ax.set_title('Poisson Shift Parameter (t)', fontsize=13, fontweight='bold')

            ax.grid(True, alpha=0.3)

        axes[-1].set_xlabel('Training Step', fontsize=12)

        plt.suptitle(f'Training History: Level {self.level} ({self.n_foci} foci)',
                     fontsize=15, fontweight='bold', y=0.995)
        plt.tight_layout()

        if save_path:
            save_dpi = dpi if dpi else 150
            plt.savefig(save_path, dpi=save_dpi, bbox_inches='tight')
            print(f"Saved training history: {save_path}")

        return fig

    def plot_kappa_evolution(
        self,
        show_raw: bool = True,
        show_calibrated: bool = True,
        show_offset: bool = False,
        figsize: Tuple[int, int] = (14, 6),
        save_path: Optional[str] = None,
        dpi: Optional[int] = None
    ) -> plt.Figure:
        """
        Detailed κζ evolution plot.

        Args:
            show_raw: Show raw κζ (M_τ/M_σ)
            show_calibrated: Show calibrated κζ
            show_offset: Show ζ-offset
            figsize: Figure size
            save_path: Where to save
            dpi: DPI for saved figure (default None)

        Returns:
            matplotlib Figure object
        """
        checkpoint_metrics = self.checkpoint.get('metrics', {})

        fig, ax = plt.subplots(figsize=figsize)

        if show_raw:
            raw_data = [k for epoch in checkpoint_metrics.get('epoch_kappa_raw', []) for k in epoch]
            ax.plot(raw_data, linewidth=2, color='darkred', alpha=0.7, label='κζ (raw M_τ/M_σ)')

        if show_calibrated:
            cal_data = [k for epoch in checkpoint_metrics.get('epoch_kappa', []) for k in epoch]
            ax.plot(cal_data, linewidth=2, color='darkgreen', alpha=0.7, label='κζ (calibrated)')

        if show_offset:
            offset_data = [o for epoch in checkpoint_metrics.get('epoch_offset', []) for o in epoch]
            ax2 = ax.twinx()
            ax2.plot(offset_data, linewidth=2, color='purple', alpha=0.5, label='ζ-offset')
            ax2.set_ylabel('ζ-offset', fontsize=12, color='purple')
            ax2.tick_params(axis='y', labelcolor='purple')

        ax.axhline(self.stabilized_kappa, color='black', linestyle='--',
                  linewidth=2, alpha=0.5, label=f'Stabilized κζ={self.stabilized_kappa:.3f}')

        ax.set_xlabel('Training Step', fontsize=12)
        ax.set_ylabel('κζ', fontsize=12)
        ax.set_title(f'κζ Evolution: Level {self.level} ({self.n_foci} foci)',
                    fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3)
        ax.legend(loc='upper left', fontsize=10)

        plt.tight_layout()

        if save_path:
            save_dpi = dpi if dpi else 150
            plt.savefig(save_path, dpi=save_dpi, bbox_inches='tight')
            print(f"Saved κζ evolution: {save_path}")

        return fig

    def generate_full_report(
        self,
        output_dir: str,
        formats: List[str] = ["png"]
    ) -> None:
        """
        Generate comprehensive visualization report.

        Creates all visualizations and saves to output directory.

        Args:
            output_dir: Directory to save all visualizations
            formats: Image formats ('png', 'pdf', 'svg')
        """
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        print(f"\nGenerating full visualization report for Level {self.level}...")
        print(f"Output directory: {output_path}")

        for fmt in formats:
            print(f"\n  Format: {fmt}")

            # 1. CGD decision boundary
            print("    - CGD decision boundary...")
            self.plot_cgd_decision_boundary(
                save_path=str(output_path / f"cgd_level_{self.level}.{fmt}")
            )
            plt.close()

            # 2. Polylipse geometry
            print("    - Polylipse geometry...")
            self.plot_polylipse_geometry(
                save_path=str(output_path / f"geometry_level_{self.level}.{fmt}")
            )
            plt.close()

            # 3. Training history
            print("    - Training history...")
            self.plot_training_history(
                save_path=str(output_path / f"history_level_{self.level}.{fmt}")
            )
            plt.close()

            # 4. κζ evolution
            print("    - κζ evolution...")
            self.plot_kappa_evolution(
                save_path=str(output_path / f"kappa_evolution_level_{self.level}.{fmt}")
            )
            plt.close()

        print(f"\n✓ Report complete! All visualizations saved to {output_path}")

    def get_summary(self) -> Dict:
        """
        Get summary information about the checkpoint.

        Returns:
            Dictionary with checkpoint metadata and statistics
        """
        checkpoint_metrics = self.checkpoint.get('metrics', {})
        summary = checkpoint_metrics.get('summary', {})

        return {
            'level': self.level,
            'n_foci': self.n_foci,
            'stabilized_kappa': self.stabilized_kappa,
            'is_stable': self.is_stable,
            'final_loss': summary.get('final_loss', None),
            'kappa_convergence': summary.get('kappa_convergence', None),
            'epochs_trained': len(checkpoint_metrics.get('epoch_loss', [])),
            'd_model': self.d_model,
            'n_heads': self.n_heads,
            'enable_zeta_norm': self.enable_zeta_norm,
            'checkpoint_version': self.checkpoint_version,
            'is_legacy': self.is_legacy,
        }


# ============================================================================
# Standalone Functions
# ============================================================================

def visualize_checkpoint(
    checkpoint_path: str,
    output_dir: Optional[str] = None,
    plots: Union[str, List[str]] = "all",
    device: Optional[str] = None
) -> CheckpointVisualizer:
    """
    Convenience function to visualize a single checkpoint.

    Args:
        checkpoint_path: Path to .pt checkpoint file
        output_dir: Where to save plots (if None, display only)
        plots: Which plots to generate ("all" or list like ["cgd", "geometry", "history"])
        device: Device to use ('cuda', 'cpu', or None for auto)

    Returns:
        CheckpointVisualizer instance

    Example:
         visualize_checkpoint("level_3_checkpoint.pt", output_dir="./viz_level_3/")
    """
    viz = CheckpointVisualizer(checkpoint_path, device=device)

    if plots == "all":
        plots_list = ["cgd", "geometry", "history", "kappa"]
    else:
        plots_list = plots if isinstance(plots, list) else [plots]

    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        for plot_type in plots_list:
            if plot_type == "cgd":
                viz.plot_cgd_decision_boundary(save_path=str(output_path / "cgd.png"))
                plt.close()
            elif plot_type == "geometry":
                viz.plot_polylipse_geometry(save_path=str(output_path / "geometry.png"))
                plt.close()
            elif plot_type == "history":
                viz.plot_training_history(save_path=str(output_path / "history.png"))
                plt.close()
            elif plot_type == "kappa":
                viz.plot_kappa_evolution(save_path=str(output_path / "kappa_evolution.png"))
                plt.close()
    else:
        # Display plots
        for plot_type in plots_list:
            if plot_type == "cgd":
                viz.plot_cgd_decision_boundary()
            elif plot_type == "geometry":
                viz.plot_polylipse_geometry()
            elif plot_type == "history":
                viz.plot_training_history()
            elif plot_type == "kappa":
                viz.plot_kappa_evolution()
            plt.show()

    return viz


def load_checkpoint_for_inference(
    checkpoint_path: str,
    device: Optional[str] = None
) -> Tuple[ZetaBlockEnhanced, nn.Linear, Dict]:
    """
    Load checkpoint and return model, classifier, and metadata.

    Simplified interface for inference use cases.

    Args:
        checkpoint_path: Path to checkpoint file
        device: Device to load on

    Returns:
        model: ZetaBlockEnhanced instance
        classifier: Linear classifier
        metadata: Dictionary with checkpoint metadata

    Example:
         model, classifier, meta = load_checkpoint_for_inference("level_3_checkpoint.pt")
         print(f"Loaded level {meta['level']} with κζ={meta['stabilized_kappa']:.3f}")
    """
    viz = CheckpointVisualizer(checkpoint_path, device=device)
    return viz.model, viz.classifier, viz.get_summary()


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python checkpoint_visualization.py <checkpoint_path> [output_dir]")
        sys.exit(1)

    checkpoint_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    visualize_checkpoint(checkpoint_path, output_dir=output_dir)
