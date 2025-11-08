"""
Helper functions for Zeta Calculator Notebook.

Provides utilities for:
- Activation-based κζ computation
- ZetaBlock component analysis (τ/σ pathways)
- Poisson parameter monitoring (β, t)
- Multi-layer profiling
- Visualization utilities

Author: Noetic Eidos Project
License: MIT
"""

import torch
import torch.nn as nn
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from typing import Dict, List, Tuple, Optional
from zeta_block_enhanced import ZetaBlockEnhanced
from zeta_translator import ZetaTranslator


# =============================================================================
# Activation-based κζ Computation
# =============================================================================

def forward_with_analysis(
    model: ZetaBlockEnhanced,
    x: torch.Tensor,
    return_eigvals: bool = False
) -> Dict[str, any]:
    """
    Run forward pass and extract all ζ-normalization components.

    Args:
        model: ZetaBlockEnhanced instance
        x: Input tensor (B, N, D)
        return_eigvals: If True, return activation eigenvalues

    Returns:
        Dictionary with keys:
            - output: Model output (B, N, D)
            - f: Combined activation (B, N, D)
            - tau: Gaussian pathway output (B, N, D)
            - sigma: Poisson pathway output (B, N, D)
            - kappa: κζ value (float) or None if zeta_norm disabled
            - kappa_raw: Raw κζ (float) or None
            - offset: Offset m* (float) or None
            - beta: Current β values (numpy array)
            - t: Current t values (numpy array)
            - eigvals: Activation eigenvalues (numpy array) if requested
    """
    # Forward pass with components
    if model.enable_zeta_norm:
        output, f, tau, sigma, kappa = model(
            x,
            return_components=True,
            return_kappa=True
        )

        # Extract raw κζ and offset from logs
        kappa_raw = model.kappa_raw_log[-1] if model.kappa_raw_log else kappa
        offset = model.offset_log[-1] if model.offset_log else 0.0
    else:
        output, f, tau, sigma = model(x, return_components=True)
        kappa = None
        kappa_raw = None
        offset = None

    # Extract parameters
    beta = model.poisson_beta.detach().cpu().numpy()
    t = model.poisson_t.detach().cpu().numpy()

    # Optionally compute eigenvalues
    eigvals = None
    if return_eigvals and model.enable_zeta_norm:
        eigvals = model._estimate_fisher_rao_curvature(f)

    return {
        'output': output,
        'f': f,
        'tau': tau,
        'sigma': sigma,
        'kappa': kappa,
        'kappa_raw': kappa_raw,
        'offset': offset,
        'beta': beta,
        't': t,
        'eigvals': eigvals,
    }


def compute_activation_curvature(
    f: torch.Tensor,
    translator: ZetaTranslator
) -> Tuple[float, float, float, np.ndarray]:
    """
    Compute κζ from activation tensor (bypasses model forward).

    Args:
        f: Activation tensor (B, N, D)
        translator: ZetaTranslator instance

    Returns:
        (kappa_calibrated, kappa_raw, offset, eigenvalues)
    """
    B, N, D = f.shape

    # Compute activation covariance
    G = torch.bmm(f.transpose(1, 2), f) / (N + 1e-8)
    G_mean = G.mean(dim=0)

    # Extract eigenvalues
    with torch.no_grad():
        eigvals = torch.linalg.eigvalsh(G_mean).clamp(min=1e-12)
        eigvals_np = eigvals.cpu().numpy()

    # Compute κζ
    kappa_raw, kappa_cal, offset = translator.kappa(
        eigvals_np,
        centered=True,
        return_tuple=True
    )

    return kappa_cal, kappa_raw, offset, eigvals_np


# =============================================================================
# Component Analysis (τ, σ Pathways)
# =============================================================================

def decompose_attention_pathways(
    model: ZetaBlockEnhanced,
    x: torch.Tensor
) -> Dict[str, torch.Tensor]:
    """
    Extract and analyze Gaussian (τ) and Poisson (σ) pathways separately.

    Args:
        model: ZetaBlockEnhanced
        x: Input tensor (B, N, D)

    Returns:
        Dictionary with pathway components and attention weights
    """
    B, N, D = x.shape

    # Get projections
    Q = model.W_Q(x).view(B, N, model.n_heads, model.d_head).transpose(1, 2)
    K = model.W_K(x).view(B, N, model.n_heads, model.d_head).transpose(1, 2)
    V = model.W_V(x).view(B, N, model.n_heads, model.d_head).transpose(1, 2)

    # Similarity matrix
    S = torch.matmul(Q, K.transpose(-2, -1)) / (model.d_head ** 0.5)

    # Gaussian weights (τ)
    W_tau = torch.softmax(S, dim=-1)

    # Poisson weights (σ)
    beta = model.poisson_beta.view(1, model.n_heads, 1, 1)
    t = model.poisson_t.view(1, model.n_heads, 1, 1)
    W_sigma = 1.0 / (((1 + S.abs()/beta)**2) + t**2)
    W_sigma = W_sigma / W_sigma.sum(dim=-1, keepdim=True)

    # Apply to V
    tau_output = torch.matmul(W_tau, V)
    sigma_output = torch.matmul(W_sigma, V)

    # Reshape
    tau_flat = tau_output.transpose(1, 2).contiguous().view(B, N, D)
    sigma_flat = sigma_output.transpose(1, 2).contiguous().view(B, N, D)
    f_combined = 0.5 * tau_flat + 0.5 * sigma_flat

    return {
        'W_tau': W_tau,        # (B, H, N, N)
        'W_sigma': W_sigma,    # (B, H, N, N)
        'tau': tau_flat,       # (B, N, D)
        'sigma': sigma_flat,   # (B, N, D)
        'f': f_combined,       # (B, N, D)
        'S': S,                # (B, H, N, N)
    }


def compare_pathway_statistics(
    tau: torch.Tensor,
    sigma: torch.Tensor
) -> Dict[str, float]:
    """
    Compute statistics comparing τ and σ pathways.

    Returns:
        Dictionary with comparison metrics
    """
    with torch.no_grad():
        return {
            'tau_mean': tau.mean().item(),
            'tau_std': tau.std().item(),
            'sigma_mean': sigma.mean().item(),
            'sigma_std': sigma.std().item(),
            'correlation': torch.corrcoef(torch.stack([
                tau.flatten(),
                sigma.flatten()
            ]))[0, 1].item(),
            'relative_magnitude': (sigma.norm() / tau.norm()).item(),
        }


# =============================================================================
# Parameter Monitoring (β, t)
# =============================================================================

def monitor_parameter_adaptation(
    model: ZetaBlockEnhanced,
    input_sequence: List[torch.Tensor],
    track_kappa: bool = True
) -> Dict[str, np.ndarray]:
    """
    Track β, t, and κζ evolution over a sequence of forward passes.

    Args:
        model: ZetaBlockEnhanced (must be in training mode for adaptation)
        input_sequence: List of input tensors
        track_kappa: Also track κζ evolution

    Returns:
        Dictionary with trajectories (arrays of shape [n_steps, n_heads] or [n_steps])
    """
    model.train()  # Enable parameter adaptation

    beta_trajectory = []
    t_trajectory = []
    kappa_trajectory = []
    kappa_raw_trajectory = []

    for x in input_sequence:
        # Record before
        beta_before = model.poisson_beta.detach().cpu().numpy().copy()
        t_before = model.poisson_t.detach().cpu().numpy().copy()

        # Forward pass
        if track_kappa and model.enable_zeta_norm:
            out, f, tau, sigma, kappa = model(
                x,
                return_components=True,
                return_kappa=True
            )
            kappa_trajectory.append(kappa)
            kappa_raw_trajectory.append(
                model.kappa_raw_log[-1] if model.kappa_raw_log else kappa
            )
        else:
            out = model(x)
            kappa_trajectory.append(0.0)
            kappa_raw_trajectory.append(0.0)

        # Record after
        beta_trajectory.append(beta_before)
        t_trajectory.append(t_before)

    return {
        'beta': np.array(beta_trajectory),          # (n_steps, n_heads)
        't': np.array(t_trajectory),                # (n_steps, n_heads)
        'kappa': np.array(kappa_trajectory),        # (n_steps,)
        'kappa_raw': np.array(kappa_raw_trajectory),# (n_steps,)
    }


# =============================================================================
# Multi-Layer Profiling
# =============================================================================

def profile_all_layers(
    models: List[ZetaBlockEnhanced],
    x: torch.Tensor,
    layer_names: Optional[List[str]] = None
) -> Dict[str, np.ndarray]:
    """
    Compute κζ and parameters for multiple ZetaBlock layers.

    Args:
        models: List of ZetaBlockEnhanced layers
        x: Input tensor (B, N, D)
        layer_names: Optional layer names (defaults to "Layer 0", "Layer 1", ...)

    Returns:
        Dictionary with per-layer metrics
    """
    if layer_names is None:
        layer_names = [f"Layer {i}" for i in range(len(models))]

    kappa_values = []
    kappa_raw_values = []
    beta_values = []
    t_values = []

    current_x = x
    for model in models:
        # Forward through this layer
        result = forward_with_analysis(model, current_x, return_eigvals=False)

        kappa_values.append(result['kappa'] if result['kappa'] is not None else 0.0)
        kappa_raw_values.append(result['kappa_raw'] if result['kappa_raw'] is not None else 0.0)
        beta_values.append(result['beta'])
        t_values.append(result['t'])

        # Update input for next layer
        current_x = result['output']

    return {
        'layer_names': layer_names,
        'kappa': np.array(kappa_values),
        'kappa_raw': np.array(kappa_raw_values),
        'beta': np.array(beta_values),  # (n_layers, n_heads)
        't': np.array(t_values),        # (n_layers, n_heads)
    }


# =============================================================================
# Visualization Utilities
# =============================================================================

def plot_eigenspectrum_analysis(
    eigvals: np.ndarray,
    kappa_cal: float,
    kappa_raw: float,
    offset: float,
    title: str = "Eigenspectrum Analysis",
    figsize: Tuple[int, int] = (12, 4)
) -> plt.Figure:
    """
    Create comprehensive eigenspectrum visualization with κζ indicators.
    """
    fig, axes = plt.subplots(1, 3, figsize=figsize)

    # Sort eigenvalues
    eigs_sorted = np.sort(eigvals)[::-1]

    # Plot 1: Linear scale spectrum
    axes[0].plot(eigs_sorted, 'o-', alpha=0.7)
    axes[0].set_xlabel("Index")
    axes[0].set_ylabel("Eigenvalue")
    axes[0].set_title("Eigenvalue Spectrum")
    axes[0].grid(True, alpha=0.3)

    # Plot 2: Log scale spectrum
    axes[1].semilogy(eigs_sorted, 'o-', alpha=0.7, color='steelblue')
    axes[1].set_xlabel("Index")
    axes[1].set_ylabel("log(Eigenvalue)")
    axes[1].set_title("Log-Scale Spectrum")
    axes[1].grid(True, alpha=0.3)

    # Plot 3: κζ indicators
    axes[2].barh(['κζ calibrated', 'κζ raw', 'Offset m*'],
                 [kappa_cal, kappa_raw, offset],
                 color=['steelblue', 'gray', 'orange'])
    axes[2].axvline(0, color='red', linestyle='--', alpha=0.5, label='Critical line')
    axes[2].set_xlabel("Value")
    axes[2].set_title("ζ-Normalization State")
    axes[2].legend()
    axes[2].grid(True, alpha=0.3, axis='x')

    fig.suptitle(title, fontsize=14, fontweight='bold')
    plt.tight_layout()

    return fig


def plot_pathway_comparison(
    pathway_dict: Dict[str, torch.Tensor],
    sample_idx: int = 0,
    head_idx: int = 0,
    figsize: Tuple[int, int] = (14, 10)
) -> plt.Figure:
    """
    Visualize τ vs σ pathways side-by-side.
    """
    fig = plt.figure(figsize=figsize)
    gs = GridSpec(2, 3, figure=fig, hspace=0.3, wspace=0.3)

    W_tau = pathway_dict['W_tau'][sample_idx, head_idx].detach().cpu().numpy()
    W_sigma = pathway_dict['W_sigma'][sample_idx, head_idx].detach().cpu().numpy()
    tau = pathway_dict['tau'][sample_idx].detach().cpu().numpy()
    sigma = pathway_dict['sigma'][sample_idx].detach().cpu().numpy()

    # Plot 1: τ attention weights
    ax1 = fig.add_subplot(gs[0, 0])
    im1 = ax1.imshow(W_tau, cmap='viridis', aspect='auto')
    ax1.set_title("Gaussian (τ) Attention Weights")
    ax1.set_xlabel("Key position")
    ax1.set_ylabel("Query position")
    plt.colorbar(im1, ax=ax1)

    # Plot 2: σ attention weights
    ax2 = fig.add_subplot(gs[0, 1])
    im2 = ax2.imshow(W_sigma, cmap='plasma', aspect='auto')
    ax2.set_title("Poisson (σ) Attention Weights")
    ax2.set_xlabel("Key position")
    ax2.set_ylabel("Query position")
    plt.colorbar(im2, ax=ax2)

    # Plot 3: Difference
    ax3 = fig.add_subplot(gs[0, 2])
    im3 = ax3.imshow(W_tau - W_sigma, cmap='RdBu_r', aspect='auto')
    ax3.set_title("Difference (τ - σ)")
    ax3.set_xlabel("Key position")
    ax3.set_ylabel("Query position")
    plt.colorbar(im3, ax=ax3)

    # Plot 4: τ output distribution
    ax4 = fig.add_subplot(gs[1, 0])
    ax4.hist(tau.flatten(), bins=50, alpha=0.7, color='steelblue', label='τ')
    ax4.set_xlabel("Value")
    ax4.set_ylabel("Frequency")
    ax4.set_title("τ Output Distribution")
    ax4.legend()
    ax4.grid(True, alpha=0.3)

    # Plot 5: σ output distribution
    ax5 = fig.add_subplot(gs[1, 1])
    ax5.hist(sigma.flatten(), bins=50, alpha=0.7, color='darkorange', label='σ')
    ax5.set_xlabel("Value")
    ax5.set_ylabel("Frequency")
    ax5.set_title("σ Output Distribution")
    ax5.legend()
    ax5.grid(True, alpha=0.3)

    # Plot 6: Correlation scatter
    ax6 = fig.add_subplot(gs[1, 2])
    ax6.scatter(tau.flatten()[::10], sigma.flatten()[::10], alpha=0.3, s=5)
    ax6.set_xlabel("τ values")
    ax6.set_ylabel("σ values")
    ax6.set_title("τ vs σ Correlation")
    ax6.grid(True, alpha=0.3)

    # Add correlation coefficient
    corr = np.corrcoef(tau.flatten(), sigma.flatten())[0, 1]
    ax6.text(0.05, 0.95, f"ρ = {corr:.3f}",
             transform=ax6.transAxes,
             verticalalignment='top',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    fig.suptitle(f"Pathway Comparison (Sample {sample_idx}, Head {head_idx})",
                 fontsize=14, fontweight='bold')

    return fig


def plot_parameter_trajectories(
    trajectories: Dict[str, np.ndarray],
    figsize: Tuple[int, int] = (14, 8)
) -> plt.Figure:
    """
    Plot β, t, and κζ evolution over forward passes.
    """
    fig, axes = plt.subplots(2, 2, figsize=figsize)

    n_steps = len(trajectories['kappa'])
    beta = trajectories['beta']  # (n_steps, n_heads)
    t = trajectories['t']        # (n_steps, n_heads)
    kappa = trajectories['kappa']

    # Plot 1: β trajectories
    for head in range(beta.shape[1]):
        axes[0, 0].plot(beta[:, head], alpha=0.7, label=f'Head {head}')
    axes[0, 0].set_xlabel("Forward pass")
    axes[0, 0].set_ylabel("β value")
    axes[0, 0].set_title("β Parameter Evolution")
    axes[0, 0].legend(fontsize=8, ncol=2)
    axes[0, 0].grid(True, alpha=0.3)

    # Plot 2: t trajectories
    for head in range(t.shape[1]):
        axes[0, 1].plot(t[:, head], alpha=0.7, label=f'Head {head}')
    axes[0, 1].set_xlabel("Forward pass")
    axes[0, 1].set_ylabel("t value")
    axes[0, 1].set_title("t Parameter Evolution")
    axes[0, 1].legend(fontsize=8, ncol=2)
    axes[0, 1].grid(True, alpha=0.3)

    # Plot 3: κζ trajectory
    axes[1, 0].plot(kappa, 'o-', alpha=0.7, color='steelblue', label='κζ calibrated')
    axes[1, 0].axhline(0, color='red', linestyle='--', alpha=0.5, label='Critical line')
    axes[1, 0].set_xlabel("Forward pass")
    axes[1, 0].set_ylabel("κζ")
    axes[1, 0].set_title("κζ Evolution")
    axes[1, 0].legend()
    axes[1, 0].grid(True, alpha=0.3)

    # Plot 4: Phase space (β vs t) for first head
    axes[1, 1].plot(beta[:, 0], t[:, 0], 'o-', alpha=0.7)
    axes[1, 1].scatter(beta[0, 0], t[0, 0], c='green', s=100, marker='o', label='Start', zorder=5)
    axes[1, 1].scatter(beta[-1, 0], t[-1, 0], c='red', s=100, marker='s', label='End', zorder=5)
    axes[1, 1].set_xlabel("β (Head 0)")
    axes[1, 1].set_ylabel("t (Head 0)")
    axes[1, 1].set_title("Parameter Phase Space")
    axes[1, 1].legend()
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    return fig


def plot_layer_profile(
    profile_dict: Dict[str, np.ndarray],
    figsize: Tuple[int, int] = (14, 6)
) -> plt.Figure:
    """
    Visualize κζ and parameter profiles across layers.
    """
    fig, axes = plt.subplots(1, 3, figsize=figsize)

    layer_names = profile_dict['layer_names']
    x_pos = np.arange(len(layer_names))

    # Plot 1: κζ per layer
    axes[0].bar(x_pos, profile_dict['kappa'], alpha=0.7, color='steelblue')
    axes[0].axhline(0, color='red', linestyle='--', alpha=0.5)
    axes[0].set_xticks(x_pos)
    axes[0].set_xticklabels(layer_names, rotation=45, ha='right')
    axes[0].set_ylabel("κζ")
    axes[0].set_title("Layer-wise κζ Profile")
    axes[0].grid(True, alpha=0.3, axis='y')

    # Plot 2: β distribution per layer
    beta_means = profile_dict['beta'].mean(axis=1)
    beta_stds = profile_dict['beta'].std(axis=1)
    axes[1].bar(x_pos, beta_means, yerr=beta_stds, alpha=0.7, color='darkorange', capsize=5)
    axes[1].set_xticks(x_pos)
    axes[1].set_xticklabels(layer_names, rotation=45, ha='right')
    axes[1].set_ylabel("β (mean ± std)")
    axes[1].set_title("Layer-wise β Profile")
    axes[1].grid(True, alpha=0.3, axis='y')

    # Plot 3: t distribution per layer
    t_means = profile_dict['t'].mean(axis=1)
    t_stds = profile_dict['t'].std(axis=1)
    axes[2].bar(x_pos, t_means, yerr=t_stds, alpha=0.7, color='green', capsize=5)
    axes[2].set_xticks(x_pos)
    axes[2].set_xticklabels(layer_names, rotation=45, ha='right')
    axes[2].set_ylabel("t (mean ± std)")
    axes[2].set_title("Layer-wise t Profile")
    axes[2].grid(True, alpha=0.3, axis='y')

    plt.tight_layout()
    return fig


# =============================================================================
# Inter-Block Synchronicity Analysis
# =============================================================================

def run_dual_block_analysis(
    block1: ZetaBlockEnhanced,
    block2: ZetaBlockEnhanced,
    x: torch.Tensor,
    compute_sync_metrics: bool = True
) -> Dict[str, any]:
    """
    Run synchronous forward passes on two ZetaBlocks and analyze coupling.

    Args:
        block1: First ZetaBlockEnhanced
        block2: Second ZetaBlockEnhanced
        x: Input tensor (B, N, D)
        compute_sync_metrics: If True, compute synchronicity metrics

    Returns:
        Dictionary with dual-block analysis results
    """
    # Forward passes
    result1 = forward_with_analysis(block1, x, return_eigvals=True)
    result2 = forward_with_analysis(block2, x, return_eigvals=True)

    # Basic results
    output = {
        'block1': result1,
        'block2': result2,
        'delta_kappa': result1['kappa'] - result2['kappa'] if result1['kappa'] and result2['kappa'] else None,
        'delta_kappa_raw': result1['kappa_raw'] - result2['kappa_raw'] if result1['kappa_raw'] and result2['kappa_raw'] else None,
    }

    # Compute synchronicity metrics if requested
    if compute_sync_metrics and result1['kappa'] is not None and result2['kappa'] is not None:
        output['sync_metrics'] = {
            'kappa_correlation': None,  # Will be computed over time series
            'offset_difference': abs(result1['offset'] - result2['offset']) if result1['offset'] and result2['offset'] else None,
            'beta_distance': float(np.linalg.norm(result1['beta'] - result2['beta'])),
            't_distance': float(np.linalg.norm(result1['t'] - result2['t'])),
            'phase_angle': float(np.arctan2(result2['kappa'], result1['kappa'])) if result1['kappa'] != 0 else None,
        }

    return output


def monitor_dual_block_synchronization(
    block1: ZetaBlockEnhanced,
    block2: ZetaBlockEnhanced,
    input_sequence: List[torch.Tensor],
    coupling_strength: float = 0.0,
) -> Dict[str, np.ndarray]:
    """
    Monitor synchronization between two ZetaBlocks over a sequence of inputs.

    Args:
        block1: First ZetaBlockEnhanced
        block2: Second ZetaBlockEnhanced
        input_sequence: List of input tensors
        coupling_strength: Coupling parameter γ for weak coupling (0.0 = no coupling)

    Returns:
        Dictionary with synchronization trajectories
    """
    block1.train()
    block2.train()

    kappa1_trajectory = []
    kappa2_trajectory = []
    delta_kappa_trajectory = []
    phase_angle_trajectory = []

    beta1_trajectory = []
    beta2_trajectory = []
    t1_trajectory = []
    t2_trajectory = []

    for x in input_sequence:
        # Get current κζ values
        result1 = forward_with_analysis(block1, x, return_eigvals=False)
        result2 = forward_with_analysis(block2, x, return_eigvals=False)

        k1 = result1['kappa'] if result1['kappa'] is not None else 0.0
        k2 = result2['kappa'] if result2['kappa'] is not None else 0.0

        # Apply weak coupling if specified (modifies feedback)
        if coupling_strength > 0.0 and block1.enable_zeta_norm and block2.enable_zeta_norm:
            # Coupling term: γ(κ₂ - κ₁) added to block1's feedback
            # Coupling term: γ(κ₁ - κ₂) added to block2's feedback
            coupling1 = coupling_strength * (k2 - k1)
            coupling2 = coupling_strength * (k1 - k2)

            # Modify parameters with coupling (simple additive coupling)
            with torch.no_grad():
                adjust1 = torch.tanh(torch.tensor(k1 + coupling1, device=block1.poisson_beta.device))
                adjust2 = torch.tanh(torch.tensor(k2 + coupling2, device=block2.poisson_beta.device))

                step1 = block1.kappa_strength * adjust1 * block1._feedback_scale
                step2 = block2.kappa_strength * adjust2 * block2._feedback_scale

                block1.poisson_beta.data *= (1.0 + step1)
                block1.poisson_beta.data.clamp_(min=1e-2, max=10.0)
                block1.poisson_t.data *= (1.0 - step1)
                block1.poisson_t.data.clamp_(min=1e-2, max=10.0)

                block2.poisson_beta.data *= (1.0 + step2)
                block2.poisson_beta.data.clamp_(min=1e-2, max=10.0)
                block2.poisson_t.data *= (1.0 - step2)
                block2.poisson_t.data.clamp_(min=1e-2, max=10.0)

        # Record trajectories
        kappa1_trajectory.append(k1)
        kappa2_trajectory.append(k2)
        delta_kappa_trajectory.append(k1 - k2)

        # Phase angle
        phase = np.arctan2(k2, k1) if k1 != 0 else 0.0
        phase_angle_trajectory.append(phase)

        # Parameters
        beta1_trajectory.append(result1['beta'].copy())
        beta2_trajectory.append(result2['beta'].copy())
        t1_trajectory.append(result1['t'].copy())
        t2_trajectory.append(result2['t'].copy())

    # Compute synchronicity metrics
    kappa1_array = np.array(kappa1_trajectory)
    kappa2_array = np.array(kappa2_trajectory)

    # Correlation coefficient
    if len(kappa1_array) > 1:
        correlation = np.corrcoef(kappa1_array, kappa2_array)[0, 1]
    else:
        correlation = 0.0

    # Synchronization strength (inverse of variance of Δκζ)
    delta_variance = np.var(delta_kappa_trajectory)
    sync_strength = 1.0 / (delta_variance + 1e-8)

    return {
        'kappa1': kappa1_array,
        'kappa2': kappa2_array,
        'delta_kappa': np.array(delta_kappa_trajectory),
        'phase_angle': np.array(phase_angle_trajectory),
        'beta1': np.array(beta1_trajectory),
        'beta2': np.array(beta2_trajectory),
        't1': np.array(t1_trajectory),
        't2': np.array(t2_trajectory),
        'correlation': correlation,
        'sync_strength': sync_strength,
        'delta_variance': delta_variance,
    }


def compute_synchronicity_metrics(
    trajectories: Dict[str, np.ndarray],
    window: int = 10
) -> Dict[str, float]:
    """
    Compute comprehensive synchronicity metrics from trajectories.

    Args:
        trajectories: Output from monitor_dual_block_synchronization
        window: Window size for rolling metrics

    Returns:
        Dictionary of synchronicity metrics
    """
    kappa1 = trajectories['kappa1']
    kappa2 = trajectories['kappa2']
    delta = trajectories['delta_kappa']
    phase = trajectories['phase_angle']

    metrics = {
        # Correlation
        'correlation': trajectories['correlation'],

        # Convergence rate (decay of |Δκζ|)
        'convergence_rate': -np.gradient(np.abs(delta)).mean() if len(delta) > 1 else 0.0,

        # Synchronization strength
        'sync_strength': trajectories['sync_strength'],
        'delta_variance': trajectories['delta_variance'],

        # Mean absolute difference
        'mean_abs_delta': np.abs(delta).mean(),
        'final_abs_delta': np.abs(delta[-1]) if len(delta) > 0 else 0.0,

        # Phase coherence (stability of phase angle)
        'phase_coherence': 1.0 - np.std(phase) / np.pi,  # Normalized to [0, 1]
        'phase_drift': np.abs(np.gradient(phase)).mean() if len(phase) > 1 else 0.0,

        # Parameter alignment
        'beta_alignment': 1.0 - np.mean([np.linalg.norm(b1 - b2)
                                         for b1, b2 in zip(trajectories['beta1'], trajectories['beta2'])]),
        't_alignment': 1.0 - np.mean([np.linalg.norm(t1 - t2)
                                      for t1, t2 in zip(trajectories['t1'], trajectories['t2'])]),
    }

    # Rolling correlation (recent synchrony)
    if len(kappa1) >= window:
        recent_corr = np.corrcoef(kappa1[-window:], kappa2[-window:])[0, 1]
        metrics['recent_correlation'] = recent_corr
    else:
        metrics['recent_correlation'] = metrics['correlation']

    return metrics


# =============================================================================
# Synchronicity Visualization
# =============================================================================

def plot_dual_block_synchronization(
    trajectories: Dict[str, np.ndarray],
    figsize: Tuple[int, int] = (16, 12)
) -> plt.Figure:
    """
    Comprehensive visualization of dual-block synchronization.
    """
    fig = plt.figure(figsize=figsize)
    gs = GridSpec(3, 3, figure=fig, hspace=0.35, wspace=0.3)

    n_steps = len(trajectories['kappa1'])
    x = np.arange(n_steps)

    # Plot 1: κζ trajectories (both blocks)
    ax1 = fig.add_subplot(gs[0, :2])
    ax1.plot(x, trajectories['kappa1'], 'o-', alpha=0.7, label='Block 1 κζ', color='steelblue')
    ax1.plot(x, trajectories['kappa2'], 's-', alpha=0.7, label='Block 2 κζ', color='darkorange')
    ax1.axhline(0, color='red', linestyle='--', alpha=0.5, label='Critical line')
    ax1.set_xlabel('Forward pass')
    ax1.set_ylabel('κζ')
    ax1.set_title('Dual κζ Trajectories')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Plot 2: Δκζ evolution
    ax2 = fig.add_subplot(gs[0, 2])
    ax2.plot(x, trajectories['delta_kappa'], 'o-', alpha=0.7, color='purple')
    ax2.axhline(0, color='black', linestyle='--', alpha=0.5)
    ax2.set_xlabel('Forward pass')
    ax2.set_ylabel('Δκζ = κζ₁ - κζ₂')
    ax2.set_title('Synchronization Error')
    ax2.grid(True, alpha=0.3)

    # Plot 3: κζ correlation scatter
    ax3 = fig.add_subplot(gs[1, 0])
    ax3.scatter(trajectories['kappa1'], trajectories['kappa2'], alpha=0.6, s=30)
    ax3.plot([trajectories['kappa1'].min(), trajectories['kappa1'].max()],
             [trajectories['kappa1'].min(), trajectories['kappa1'].max()],
             'r--', alpha=0.5, label='Perfect sync')
    ax3.set_xlabel('Block 1 κζ')
    ax3.set_ylabel('Block 2 κζ')
    ax3.set_title(f"κζ Correlation\nρ = {trajectories['correlation']:.3f}")
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    ax3.axis('equal')

    # Plot 4: Phase angle evolution
    ax4 = fig.add_subplot(gs[1, 1])
    ax4.plot(x, np.rad2deg(trajectories['phase_angle']), 'o-', alpha=0.7, color='green')
    ax4.set_xlabel('Forward pass')
    ax4.set_ylabel('Phase angle (degrees)')
    ax4.set_title('Phase Dynamics')
    ax4.grid(True, alpha=0.3)

    # Plot 5: Phase space (κζ₁ vs κζ₂) with trajectory
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.plot(trajectories['kappa1'], trajectories['kappa2'], '-', alpha=0.5, color='gray')
    ax5.scatter(trajectories['kappa1'], trajectories['kappa2'],
                c=np.arange(n_steps), cmap='viridis', s=30, alpha=0.7)
    ax5.scatter(trajectories['kappa1'][0], trajectories['kappa2'][0],
                c='green', s=100, marker='o', edgecolors='black', linewidths=2,
                label='Start', zorder=5)
    ax5.scatter(trajectories['kappa1'][-1], trajectories['kappa2'][-1],
                c='red', s=100, marker='s', edgecolors='black', linewidths=2,
                label='End', zorder=5)
    ax5.plot([trajectories['kappa1'].min(), trajectories['kappa1'].max()],
             [trajectories['kappa1'].min(), trajectories['kappa1'].max()],
             'r--', alpha=0.3)
    ax5.set_xlabel('Block 1 κζ')
    ax5.set_ylabel('Block 2 κζ')
    ax5.set_title('Phase Space Trajectory')
    ax5.legend()
    ax5.grid(True, alpha=0.3)

    # Plot 6: β parameter alignment
    ax6 = fig.add_subplot(gs[2, 0])
    beta1_mean = trajectories['beta1'].mean(axis=1)
    beta2_mean = trajectories['beta2'].mean(axis=1)
    ax6.plot(x, beta1_mean, 'o-', alpha=0.7, label='Block 1 β', color='steelblue')
    ax6.plot(x, beta2_mean, 's-', alpha=0.7, label='Block 2 β', color='darkorange')
    ax6.set_xlabel('Forward pass')
    ax6.set_ylabel('β (mean across heads)')
    ax6.set_title('β Parameter Synchrony')
    ax6.legend()
    ax6.grid(True, alpha=0.3)

    # Plot 7: t parameter alignment
    ax7 = fig.add_subplot(gs[2, 1])
    t1_mean = trajectories['t1'].mean(axis=1)
    t2_mean = trajectories['t2'].mean(axis=1)
    ax7.plot(x, t1_mean, 'o-', alpha=0.7, label='Block 1 t', color='steelblue')
    ax7.plot(x, t2_mean, 's-', alpha=0.7, label='Block 2 t', color='darkorange')
    ax7.set_xlabel('Forward pass')
    ax7.set_ylabel('t (mean across heads)')
    ax7.set_title('t Parameter Synchrony')
    ax7.legend()
    ax7.grid(True, alpha=0.3)

    # Plot 8: Synchronicity metrics summary
    ax8 = fig.add_subplot(gs[2, 2])
    metrics = compute_synchronicity_metrics(trajectories)

    metric_names = ['Correlation', 'Sync Strength', 'Phase Coherence', 'β Alignment', 't Alignment']
    metric_values = [
        metrics['correlation'],
        min(metrics['sync_strength'] / 10.0, 1.0),  # Normalize for display
        metrics['phase_coherence'],
        max(0, metrics['beta_alignment']),
        max(0, metrics['t_alignment']),
    ]

    colors_map = ['steelblue' if v > 0.5 else 'orange' if v > 0.2 else 'red' for v in metric_values]
    ax8.barh(metric_names, metric_values, color=colors_map, alpha=0.7)
    ax8.set_xlim(0, 1)
    ax8.set_xlabel('Metric Value')
    ax8.set_title('Synchronicity Summary')
    ax8.grid(True, alpha=0.3, axis='x')

    fig.suptitle('Dual ZetaBlock Synchronization Analysis',
                 fontsize=16, fontweight='bold')

    return fig


def plot_coupling_strength_scan(
    block1: ZetaBlockEnhanced,
    block2: ZetaBlockEnhanced,
    input_sequence: List[torch.Tensor],
    coupling_range: Tuple[float, float] = (0.0, 0.5),
    n_points: int = 10,
    figsize: Tuple[int, int] = (14, 5)
) -> plt.Figure:
    """
    Scan coupling strength γ and measure synchronization metrics.

    This explores the ζ-resonance threshold where blocks lock.
    """
    coupling_values = np.linspace(coupling_range[0], coupling_range[1], n_points)

    correlations = []
    sync_strengths = []
    delta_variances = []

    for gamma in coupling_values:
        # Reset blocks (would need proper state management in practice)
        traj = monitor_dual_block_synchronization(
            block1, block2, input_sequence, coupling_strength=gamma
        )
        correlations.append(traj['correlation'])
        sync_strengths.append(traj['sync_strength'])
        delta_variances.append(traj['delta_variance'])

    fig, axes = plt.subplots(1, 3, figsize=figsize)

    # Plot 1: Correlation vs coupling
    axes[0].plot(coupling_values, correlations, 'o-', linewidth=2, markersize=8)
    axes[0].set_xlabel('Coupling strength γ')
    axes[0].set_ylabel('Correlation ρ')
    axes[0].set_title('κζ Correlation vs Coupling')
    axes[0].grid(True, alpha=0.3)
    axes[0].axhline(0, color='black', linestyle='--', alpha=0.3)

    # Plot 2: Sync strength vs coupling
    axes[1].plot(coupling_values, sync_strengths, 'o-', linewidth=2,
                 markersize=8, color='darkorange')
    axes[1].set_xlabel('Coupling strength γ')
    axes[1].set_ylabel('Synchronization strength')
    axes[1].set_title('Sync Strength vs Coupling')
    axes[1].grid(True, alpha=0.3)

    # Plot 3: Delta variance vs coupling
    axes[2].plot(coupling_values, delta_variances, 'o-', linewidth=2,
                 markersize=8, color='green')
    axes[2].set_xlabel('Coupling strength γ')
    axes[2].set_ylabel('Var(Δκζ)')
    axes[2].set_title('Synchronization Error vs Coupling')
    axes[2].grid(True, alpha=0.3)

    plt.suptitle('ζ-Resonance Threshold Analysis', fontsize=14, fontweight='bold')
    plt.tight_layout()

    return fig
