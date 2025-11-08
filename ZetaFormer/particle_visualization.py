"""
Particle Visualization Tools for κζ-Coupled Systems

This module provides visualization functions for:
- Particle trajectories over time
- κζ field heatmaps with particle overlays
- Force vector fields
- Energy and observable evolution plots
- Multi-scale force decomposition
- Equilibrium configuration analysis

Integrates with matplotlib for static plots and supports animation.

Author: Enhanced for Noetic Eidos Project
License: MIT
"""

import torch
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Circle
from typing import Optional, Dict, List, Tuple

from particle_dynamics import ParticleState, FociConfiguration
from kappa_zeta_field import KappaZetaField
from hybrid_particle_system import HybridParticleSystem


def plot_particles_and_foci(
    state: ParticleState,
    foci_config: FociConfiguration,
    kappa_field: Optional[torch.Tensor] = None,
    title: str = "Particle Configuration",
    ax: Optional[plt.Axes] = None,
    show_velocities: bool = False,
    figsize: Tuple[float, float] = (10, 8)
) -> plt.Figure:
    """
    Plot particles and foci in 2D.

    Args:
        state: Particle state
        foci_config: Foci configuration
        kappa_field: Optional (n_particles,) local κ values for coloring
        title: Plot title
        ax: Optional existing axes
        show_velocities: If True, show velocity vectors
        figsize: Figure size

    Returns:
        Figure object
    """
    if ax is None:
        fig, ax = plt.subplots(figsize=figsize)
    else:
        fig = ax.figure

    positions = state.positions.numpy()
    velocities = state.velocities.numpy()

    # Plot foci as large red stars
    foci_centers = foci_config.centers.numpy()
    ax.scatter(foci_centers[:, 0], foci_centers[:, 1],
               c='red', marker='*', s=500, edgecolors='black',
               linewidths=2, label='Foci', zorder=3)

    # Label foci
    for i, center in enumerate(foci_centers):
        ax.text(center[0], center[1] + 0.3,
                f'F{i+1}\nw={foci_config.weights[i]:.2f}',
                ha='center', fontsize=9, color='darkred')

    # Plot particles
    if kappa_field is not None:
        # Color by κ value
        kappa_vals = kappa_field.numpy()
        scatter = ax.scatter(positions[:, 0], positions[:, 1],
                            c=kappa_vals, cmap='viridis', s=100,
                            edgecolors='black', linewidths=0.5,
                            label='Particles', zorder=2)
        cbar = plt.colorbar(scatter, ax=ax)
        cbar.set_label('κ (tau moment)', fontsize=10)
    else:
        ax.scatter(positions[:, 0], positions[:, 1],
                  c='blue', s=100, edgecolors='black',
                  linewidths=0.5, label='Particles', zorder=2)

    # Show velocities as arrows
    if show_velocities:
        ax.quiver(positions[:, 0], positions[:, 1],
                 velocities[:, 0], velocities[:, 1],
                 alpha=0.6, width=0.004, scale=5, zorder=1,
                 label='Velocities')

    ax.set_xlabel('x', fontsize=12)
    ax.set_ylabel('y', fontsize=12)
    ax.set_title(title, fontsize=14)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)
    ax.set_aspect('equal')

    return fig


def plot_kappa_field_heatmap(
    kappa_zeta_field: KappaZetaField,
    state: Optional[ParticleState] = None,
    foci_config: Optional[FociConfiguration] = None,
    title: str = "κζ Field",
    figsize: Tuple[float, float] = (12, 10)
) -> plt.Figure:
    """
    Plot κζ field as heatmap with optional particle overlay.

    Args:
        kappa_zeta_field: κζ field object
        state: Optional particle state for overlay
        foci_config: Optional foci configuration
        title: Plot title
        figsize: Figure size

    Returns:
        Figure object
    """
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)

    # Get field values on grid
    kappa_grid = kappa_zeta_field.kappa_field.numpy()
    kappa_2d = kappa_zeta_field.grid.unflatten_field(kappa_zeta_field.kappa_field).numpy()

    M_tau_2d = kappa_zeta_field.grid.unflatten_field(kappa_zeta_field.M_tau_field).numpy()
    M_sigma_2d = kappa_zeta_field.grid.unflatten_field(kappa_zeta_field.M_sigma_field).numpy()

    # Grid extent
    x_min, x_max = kappa_zeta_field.grid.bounds[0]
    y_min, y_max = kappa_zeta_field.grid.bounds[1]
    extent = [x_min, x_max, y_min, y_max]

    # Plot κζ field
    im1 = ax1.imshow(kappa_2d.T, origin='lower', extent=extent,
                     cmap='RdYlBu_r', aspect='auto')
    ax1.set_xlabel('x', fontsize=12)
    ax1.set_ylabel('y', fontsize=12)
    ax1.set_title(f'κζ = M_τ / M_σ', fontsize=14)
    plt.colorbar(im1, ax=ax1, label='κζ')

    # Plot M_τ field
    im2 = ax2.imshow(M_tau_2d.T, origin='lower', extent=extent,
                     cmap='Reds', aspect='auto')
    ax2.set_xlabel('x', fontsize=12)
    ax2.set_ylabel('y', fontsize=12)
    ax2.set_title('M_τ (tau moment)', fontsize=14)
    plt.colorbar(im2, ax=ax2, label='M_τ')

    # Overlay particles
    if state is not None:
        positions = state.positions.numpy()
        for ax in [ax1, ax2]:
            ax.scatter(positions[:, 0], positions[:, 1],
                      c='white', s=50, edgecolors='black',
                      linewidths=1, zorder=3, alpha=0.8)

    # Overlay foci
    if foci_config is not None:
        foci_centers = foci_config.centers.numpy()
        for ax in [ax1, ax2]:
            ax.scatter(foci_centers[:, 0], foci_centers[:, 1],
                      c='yellow', marker='*', s=300,
                      edgecolors='black', linewidths=2, zorder=4)

    fig.suptitle(title, fontsize=16)
    plt.tight_layout()

    return fig


def plot_trajectory(
    history: Dict,
    particle_idx: int = 0,
    foci_config: Optional[FociConfiguration] = None,
    figsize: Tuple[float, float] = (10, 8)
) -> plt.Figure:
    """
    Plot trajectory of a single particle over time.

    Args:
        history: Simulation history dict
        particle_idx: Index of particle to plot
        foci_config: Optional foci configuration for reference
        figsize: Figure size

    Returns:
        Figure object
    """
    fig, ax = plt.subplots(figsize=figsize)

    # Extract trajectory
    positions = [pos[particle_idx].numpy() for pos in history['positions']]
    trajectory = np.array(positions)

    # Plot trajectory
    ax.plot(trajectory[:, 0], trajectory[:, 1],
            'b-', linewidth=2, label=f'Particle {particle_idx}')

    # Mark start and end
    ax.scatter(trajectory[0, 0], trajectory[0, 1],
              c='green', s=200, marker='o',
              edgecolors='black', linewidths=2,
              label='Start', zorder=3)
    ax.scatter(trajectory[-1, 0], trajectory[-1, 1],
              c='red', s=200, marker='s',
              edgecolors='black', linewidths=2,
              label='End', zorder=3)

    # Plot foci
    if foci_config is not None:
        foci_centers = foci_config.centers.numpy()
        ax.scatter(foci_centers[:, 0], foci_centers[:, 1],
                  c='orange', marker='*', s=500,
                  edgecolors='black', linewidths=2,
                  label='Foci', zorder=2)

    ax.set_xlabel('x', fontsize=12)
    ax.set_ylabel('y', fontsize=12)
    ax.set_title(f'Particle {particle_idx} Trajectory', fontsize=14)
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)
    ax.set_aspect('equal')

    return fig


def plot_energy_evolution(
    history: Dict,
    figsize: Tuple[float, float] = (12, 5)
) -> plt.Figure:
    """
    Plot energy and κζ evolution over time.

    Args:
        history: Simulation history
        figsize: Figure size

    Returns:
        Figure object
    """
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)

    times = np.array(history['time'])
    energies = np.array(history['energy'])

    # Energy plot
    ax1.plot(times, energies, 'b-', linewidth=2)
    ax1.set_xlabel('Time', fontsize=12)
    ax1.set_ylabel('Total Energy', fontsize=12)
    ax1.set_title('Energy Evolution', fontsize=14)
    ax1.grid(True, alpha=0.3)

    # Energy drift
    if len(energies) > 1:
        energy_drift = energies - energies[0]
        ax1_twin = ax1.twinx()
        ax1_twin.plot(times, energy_drift, 'r--', alpha=0.5, label='Drift')
        ax1_twin.set_ylabel('Energy Drift', fontsize=12, color='r')
        ax1_twin.tick_params(axis='y', labelcolor='r')

    # κζ evolution
    if 'kappa_field_mean' in history and len(history['kappa_field_mean']) > 0:
        kappa_means = np.array(history['kappa_field_mean'])
        ax2.plot(times[1:], kappa_means, 'g-', linewidth=2)
        ax2.set_xlabel('Time', fontsize=12)
        ax2.set_ylabel('Mean κζ', fontsize=12)
        ax2.set_title('κζ Field Evolution', fontsize=14)
        ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    return fig


def plot_force_decomposition(
    force_components: Dict[str, torch.Tensor],
    figsize: Tuple[float, float] = (10, 6)
) -> plt.Figure:
    """
    Plot multi-scale force decomposition.

    Args:
        force_components: Dict of force tensors by scale
        figsize: Figure size

    Returns:
        Figure object
    """
    fig, ax = plt.subplots(figsize=figsize)

    scales = list(force_components.keys())
    force_norms = []

    for scale, forces in force_components.items():
        norms = forces.norm(dim=1).numpy()
        force_norms.append(norms)

    # Box plot
    bp = ax.boxplot(force_norms, labels=scales, patch_artist=True)

    # Color boxes
    colors = ['lightblue', 'lightgreen', 'lightcoral']
    for patch, color in zip(bp['boxes'], colors):
        patch.set_facecolor(color)

    ax.set_ylabel('Force Magnitude', fontsize=12)
    ax.set_title('Multi-Scale Force Decomposition', fontsize=14)
    ax.grid(True, alpha=0.3, axis='y')

    return fig


def create_animation(
    history: Dict,
    foci_config: FociConfiguration,
    interval: int = 50,
    figsize: Tuple[float, float] = (10, 8),
    save_path: Optional[str] = None
):
    """
    Create animation of particle motion.

    Args:
        history: Simulation history
        foci_config: Foci configuration
        interval: Milliseconds between frames
        figsize: Figure size
        save_path: If provided, save animation to this path

    Returns:
        Animation object
    """
    fig, ax = plt.subplots(figsize=figsize)

    # Setup plot
    foci_centers = foci_config.centers.numpy()
    ax.scatter(foci_centers[:, 0], foci_centers[:, 1],
              c='red', marker='*', s=500,
              edgecolors='black', linewidths=2,
              label='Foci', zorder=3)

    # Initialize particle scatter
    positions_0 = history['positions'][0].numpy()
    particles = ax.scatter(positions_0[:, 0], positions_0[:, 1],
                          c='blue', s=100, edgecolors='black',
                          linewidths=0.5, label='Particles', zorder=2)

    # Set limits
    all_positions = torch.cat(history['positions']).numpy()
    margin = 1.0
    ax.set_xlim(all_positions[:, 0].min() - margin, all_positions[:, 0].max() + margin)
    ax.set_ylim(all_positions[:, 1].min() - margin, all_positions[:, 1].max() + margin)

    ax.set_xlabel('x', fontsize=12)
    ax.set_ylabel('y', fontsize=12)
    ax.set_aspect('equal')
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    time_text = ax.text(0.02, 0.98, '', transform=ax.transAxes,
                       verticalalignment='top', fontsize=12,
                       bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    def update(frame):
        positions = history['positions'][frame].numpy()
        particles.set_offsets(positions)
        time_text.set_text(f't = {history["time"][frame]:.3f}')
        return particles, time_text

    anim = FuncAnimation(fig, update, frames=len(history['time']),
                        interval=interval, blit=True)

    if save_path:
        anim.save(save_path, writer='pillow', fps=20)
        print(f"Animation saved to {save_path}")

    return anim


def plot_system_overview(
    system: HybridParticleSystem,
    figsize: Tuple[float, float] = (16, 12)
) -> plt.Figure:
    """
    Create comprehensive overview plot of system state.

    Args:
        system: Hybrid particle system
        figsize: Figure size

    Returns:
        Figure object
    """
    fig = plt.figure(figsize=figsize)
    gs = fig.add_gridspec(3, 3, hspace=0.3, wspace=0.3)

    # 1. Particles and foci
    ax1 = fig.add_subplot(gs[0:2, 0:2])
    kappa_field, _ = system.field_generator.compute_local_kappa_field(
        system.state.positions, system.state
    )
    plot_particles_and_foci(
        system.state,
        system.foci_config,
        kappa_field,
        title="Current Configuration",
        ax=ax1,
        show_velocities=True
    )

    # 2. Energy history
    if len(system.history['energy']) > 1:
        ax2 = fig.add_subplot(gs[0, 2])
        times = np.array(system.history['time'])
        energies = np.array(system.history['energy'])
        ax2.plot(times, energies, 'b-', linewidth=2)
        ax2.set_xlabel('Time', fontsize=10)
        ax2.set_ylabel('Energy', fontsize=10)
        ax2.set_title('Energy Evolution', fontsize=12)
        ax2.grid(True, alpha=0.3)

    # 3. κζ history
    if len(system.history['kappa_field_mean']) > 1:
        ax3 = fig.add_subplot(gs[1, 2])
        kappa_history = np.array(system.history['kappa_field_mean'])
        ax3.plot(times[1:], kappa_history, 'g-', linewidth=2)
        ax3.axhline(y=system.foci_config.kappa_zeta, color='r',
                   linestyle='--', label='Target')
        ax3.set_xlabel('Time', fontsize=10)
        ax3.set_ylabel('Mean κζ', fontsize=10)
        ax3.set_title('κζ Evolution', fontsize=12)
        ax3.legend(fontsize=8)
        ax3.grid(True, alpha=0.3)

    # 4. Force statistics
    if len(system.history['force_stats']) > 0:
        ax4 = fig.add_subplot(gs[2, :])

        latest_stats = system.history['force_stats'][-1]
        scales = list(latest_stats.keys())
        means = [latest_stats[s]['mean_norm'] for s in scales]

        ax4.bar(scales, means, color=['lightblue', 'lightgreen', 'lightcoral'])
        ax4.set_ylabel('Mean Force Magnitude', fontsize=10)
        ax4.set_title('Current Force Components', fontsize=12)
        ax4.grid(True, alpha=0.3, axis='y')

    # Overall title
    fig.suptitle(f'System Overview: t={system.state.time:.3f}, ' +
                f'N={system.state.n_particles}, ' +
                f'κζ_target={system.foci_config.kappa_zeta:.2f}',
                fontsize=16)

    return fig


if __name__ == "__main__":
    print("="*80)
    print("Particle Visualization Tools - Test Suite")
    print("="*80)

    # Create a simple system for testing
    from hybrid_particle_system import create_default_system

    system = create_default_system(n_foci=3, kappa_target=1.5, n_particles=15)

    print("\n[Test 1] Running short simulation...")
    print("-"*80)
    system.run(n_steps=20, verbose=False)

    # Test visualizations
    print("\n[Test 2] Creating visualizations...")
    print("-"*80)

    # Particles and foci
    kappa_field, _ = system.field_generator.compute_local_kappa_field(
        system.state.positions, system.state
    )
    fig1 = plot_particles_and_foci(
        system.state,
        system.foci_config,
        kappa_field,
        show_velocities=True
    )
    print("  ✓ Particles and foci plot created")

    # κζ field heatmap
    fig2 = plot_kappa_field_heatmap(
        system.kappa_zeta_field,
        system.state,
        system.foci_config
    )
    print("  ✓ κζ field heatmap created")

    # Trajectory
    fig3 = plot_trajectory(system.history, particle_idx=0, foci_config=system.foci_config)
    print("  ✓ Trajectory plot created")

    # Energy evolution
    fig4 = plot_energy_evolution(system.history)
    print("  ✓ Energy evolution plot created")

    # System overview
    fig5 = plot_system_overview(system)
    print("  ✓ System overview plot created")

    print("\n" + "="*80)
    print("All visualization tests passed!")
    print("Close the plot windows to continue...")
    print("="*80)

    plt.show()
