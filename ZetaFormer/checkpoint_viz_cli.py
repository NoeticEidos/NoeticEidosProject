"""
Checkpoint Visualization CLI

Command-line interface for visualizing ZetaFormer training checkpoints.

Supports:
- Single checkpoint visualization
- Full curriculum progression analysis
- Comparison of multiple curriculum runs

Usage:
    # Visualize single checkpoint
    python checkpoint_viz_cli.py checkpoint path/to/checkpoint.pt

    # Visualize full curriculum
    python checkpoint_viz_cli.py curriculum path/to/checkpoint_dir

    # Compare multiple runs
    python checkpoint_viz_cli.py compare run1/ run2/ run3/

    # Show available options
    python checkpoint_viz_cli.py --help

Author: Noetic Eidos Project
License: MIT
"""

import argparse
import sys
from pathlib import Path
from typing import List, Optional

import torch
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend for CLI

from checkpoint_visualization import (
    CheckpointVisualizer,
    visualize_checkpoint,
    load_checkpoint_for_inference
)
from curriculum_visualization import (
    CurriculumVisualizer,
    visualize_curriculum_from_checkpoints,
    compare_curriculum_runs
)


def cmd_checkpoint(args):
    """Handle single checkpoint visualization."""
    print("="*80)
    print("SINGLE CHECKPOINT VISUALIZATION")
    print("="*80)
    print(f"Checkpoint: {args.checkpoint}")
    print(f"Output: {args.output}")
    print(f"Include CGD: {args.cgd}")
    print(f"Formats: {', '.join(args.format)}")
    print("="*80)
    print()

    try:
        visualizer = CheckpointVisualizer(
            args.checkpoint,
            device=args.device
        )

        # Create output directory
        output_dir = Path(args.output)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate visualizations based on requested types
        if args.all or 'geometry' in args.types:
            print("[1/4] Generating polylipse geometry...")
            for fmt in args.format:
                visualizer.plot_polylipse_geometry(
                    save_path=output_dir / f"polylipse_geometry.{fmt}",
                    dpi=args.dpi
                )

        if args.all or 'history' in args.types:
            print("[2/4] Generating training history...")
            for fmt in args.format:
                visualizer.plot_training_history(
                    save_path=output_dir / f"training_history.{fmt}",
                    dpi=args.dpi
                )

        if args.all or 'kappa' in args.types:
            print("[3/4] Generating kappa evolution...")
            for fmt in args.format:
                visualizer.plot_kappa_evolution(
                    save_path=output_dir / f"kappa_evolution.{fmt}",
                    dpi=args.dpi
                )

        if args.cgd and (args.all or 'cgd' in args.types):
            print("[4/4] Generating CGD decision boundary...")
            for fmt in args.format:
                visualizer.plot_cgd_decision_boundary(
                    sigma=args.sigma,
                    t=args.t,
                    w=args.w,
                    eta=args.eta,
                    n_samples=args.n_samples,
                    save_path=output_dir / f"cgd_boundary.{fmt}",
                    dpi=args.dpi
                )

        print()
        print("="*80)
        print("VISUALIZATION COMPLETE")
        print("="*80)
        print(f"Output directory: {output_dir}")
        print("="*80)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_curriculum(args):
    """Handle curriculum visualization."""
    print("="*80)
    print("CURRICULUM VISUALIZATION")
    print("="*80)
    print(f"Checkpoint directory: {args.checkpoint_dir}")
    print(f"Output: {args.output}")
    print(f"Include CGD: {args.cgd}")
    print(f"Max levels: {args.max_levels if args.max_levels else 'All'}")
    print(f"Formats: {', '.join(args.format)}")
    print("="*80)
    print()

    try:
        cv = CurriculumVisualizer(
            args.checkpoint_dir,
            device=args.device,
            load_models=args.cgd  # Only load models if CGD requested
        )

        output_dir = Path(args.output)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate requested visualizations
        if args.all or 'progression' in args.types:
            print("[1/5] Generating curriculum progression grid...")
            for fmt in args.format:
                cv.plot_curriculum_progression(
                    max_levels=args.max_levels,
                    save_path=output_dir / f"curriculum_progression.{fmt}",
                    dpi=args.dpi
                )

        if args.all or 'trajectory' in args.types:
            print("[2/5] Generating kappa trajectory...")
            for fmt in args.format:
                cv.plot_kappa_trajectory(
                    save_path=output_dir / f"kappa_trajectory.{fmt}",
                    dpi=args.dpi
                )

        if args.all or 'evolution' in args.types:
            print("[3/5] Generating detailed kappa evolution...")
            for fmt in args.format:
                cv.plot_kappa_evolution_detailed(
                    max_levels=args.max_levels,
                    save_path=output_dir / f"kappa_evolution_detailed.{fmt}",
                    dpi=args.dpi
                )

        if args.all or 'metrics' in args.types:
            print("[4/5] Generating training metrics...")
            for fmt in args.format:
                cv.plot_training_metrics(
                    save_path=output_dir / f"training_metrics.{fmt}",
                    dpi=args.dpi
                )

        if args.cgd and (args.all or 'cgd' in args.types):
            print("[5/5] Generating CGD curriculum (this may take a while)...")
            cgd_dir = output_dir / "cgd"
            cv.plot_cgd_curriculum(
                max_levels=args.max_levels,
                sigma=args.sigma,
                t=args.t,
                w=args.w,
                eta=args.eta,
                n_samples=args.n_samples,
                save_dir=cgd_dir,
                dpi=args.dpi
            )

        # Save summary
        print("\nSaving curriculum summary...")
        summary = cv.get_summary()
        import json
        with open(output_dir / "curriculum_summary.json", 'w') as f:
            json.dump(summary, f, indent=2, default=str)

        print()
        print("="*80)
        print("CURRICULUM VISUALIZATION COMPLETE")
        print("="*80)
        print(f"Curriculum: {cv.levels[0]} → {cv.levels[-1]} foci ({len(cv.levels)} levels)")
        print(f"κζ trajectory: {cv.kappa_trajectory[0]:.3f} → {cv.kappa_trajectory[-1]:.3f}")
        print(f"Output directory: {output_dir}")
        print("="*80)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


def cmd_compare(args):
    """Handle comparison of multiple curriculum runs."""
    print("="*80)
    print("CURRICULUM COMPARISON")
    print("="*80)
    print(f"Comparing {len(args.run_dirs)} curriculum runs:")
    for i, run_dir in enumerate(args.run_dirs):
        name = args.names[i] if args.names and i < len(args.names) else Path(run_dir).name
        print(f"  [{i+1}] {name}: {run_dir}")
    print(f"Output: {args.output}")
    print("="*80)
    print()

    try:
        names = args.names if args.names else None

        fig = compare_curriculum_runs(
            args.run_dirs,
            run_names=names,
            output_dir=args.output,
            dpi=args.dpi
        )

        print()
        print("="*80)
        print("COMPARISON COMPLETE")
        print("="*80)
        print(f"Output: {args.output}")
        print("="*80)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


def cmd_report(args):
    """Generate comprehensive report for curriculum."""
    print("="*80)
    print("COMPREHENSIVE CURRICULUM REPORT")
    print("="*80)
    print(f"Checkpoint directory: {args.checkpoint_dir}")
    print(f"Output: {args.output}")
    print(f"Include CGD: {args.cgd}")
    print(f"Formats: {', '.join(args.format)}")
    print("="*80)
    print()

    try:
        cv = CurriculumVisualizer(
            args.checkpoint_dir,
            device=args.device,
            load_models=args.cgd
        )

        output_dir = Path(args.output)

        outputs = cv.generate_curriculum_report(
            output_dir,
            include_cgd=args.cgd,
            formats=args.format
        )

        print()
        print("="*80)
        print("REPORT GENERATION COMPLETE")
        print("="*80)
        print(f"Generated {len(outputs)} output files")
        print(f"Output directory: {output_dir}")
        print("="*80)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


def cmd_info(args):
    """Display information about checkpoint(s)."""
    print("="*80)
    print("CHECKPOINT INFO")
    print("="*80)
    print()

    if args.checkpoint.is_file():
        # Single checkpoint
        try:
            checkpoint = torch.load(args.checkpoint, map_location='cpu')

            print(f"Checkpoint: {args.checkpoint}")
            print()

            # Model config
            if 'model_config' in checkpoint:
                print("Model Configuration:")
                for k, v in checkpoint['model_config'].items():
                    print(f"  {k}: {v}")
                print()

            # Dataset config
            if 'dataset_config' in checkpoint:
                print("Dataset Configuration:")
                ds = checkpoint['dataset_config']
                print(f"  n_foci: {ds['n_foci']}")
                print(f"  observed_kappa: {ds['observed_kappa']:.4f}")
                if 'M_tau' in ds and 'M_sigma' in ds:
                    print(f"  M_tau: {ds['M_tau']:.4f}")
                    print(f"  M_sigma: {ds['M_sigma']:.4f}")
                print()

            # Curriculum info
            if 'curriculum_info' in checkpoint:
                print("Curriculum Info:")
                for k, v in checkpoint['curriculum_info'].items():
                    if isinstance(v, float):
                        print(f"  {k}: {v:.4f}")
                    else:
                        print(f"  {k}: {v}")
                print()

            # Training metrics
            if 'metrics' in checkpoint:
                metrics = checkpoint['metrics']
                print("Training Metrics:")
                print(f"  Total epochs: {len(metrics.get('epoch_loss', []))}")
                if 'epoch_loss' in metrics:
                    print(f"  Final loss: {metrics['epoch_loss'][-1]:.6f}")
                if 'epoch_kappa_raw' in metrics:
                    print(f"  Final κζ (raw): {metrics['epoch_kappa_raw'][-1]:.4f}")
                if 'epoch_kappa' in metrics:
                    print(f"  Final κζ (calibrated): {metrics['epoch_kappa'][-1]:.4f}")
                print()

            # Metadata
            if 'metadata' in checkpoint:
                print("Metadata:")
                for k, v in checkpoint['metadata'].items():
                    print(f"  {k}: {v}")
                print()

        except Exception as e:
            print(f"Error loading checkpoint: {e}", file=sys.stderr)
            sys.exit(1)

    elif args.checkpoint.is_dir():
        # Curriculum directory
        try:
            cv = CurriculumVisualizer(args.checkpoint, load_models=False)

            print(f"Curriculum Directory: {args.checkpoint}")
            print()
            print(f"Total Levels: {len(cv.levels)}")
            print(f"Focal Range: {cv.levels[0]} → {cv.levels[-1]} foci")
            print(f"κζ Trajectory: {cv.kappa_trajectory[0]:.3f} → {cv.kappa_trajectory[-1]:.3f}")
            print(f"  Change: Δκζ = {cv.kappa_trajectory[-1] - cv.kappa_trajectory[0]:.3f}")
            print(f"  Mean: {cv.get_summary()['kappa_mean']:.3f} ± {cv.get_summary()['kappa_std']:.3f}")
            print()

            print("Level Summary:")
            print(f"  {'Level':<8} {'κζ':<10} {'Epochs':<10} {'Final Loss':<12}")
            print("  " + "-"*40)
            for summary in cv.metrics_summary:
                level = summary['level']
                kappa_idx = cv.levels.index(level)
                kappa = cv.kappa_trajectory[kappa_idx]
                epochs = summary['total_epochs']
                loss = summary['final_loss']
                loss_str = f"{loss:.6f}" if loss is not None else "N/A"
                print(f"  {level:<8} {kappa:<10.4f} {epochs:<10} {loss_str:<12}")
            print()

        except Exception as e:
            print(f"Error loading curriculum: {e}", file=sys.stderr)
            sys.exit(1)

    else:
        print(f"Error: {args.checkpoint} is neither a file nor a directory", file=sys.stderr)
        sys.exit(1)

    print("="*80)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="ZetaFormer Checkpoint Visualization CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Visualize single checkpoint (all plots)
  python checkpoint_viz_cli.py checkpoint level_3_checkpoint.pt

  # Visualize checkpoint with CGD
  python checkpoint_viz_cli.py checkpoint level_3_checkpoint.pt --cgd

  # Visualize curriculum
  python checkpoint_viz_cli.py curriculum ./polylipse_curriculum_results

  # Generate full curriculum report
  python checkpoint_viz_cli.py report ./polylipse_curriculum_results -o ./report

  # Compare multiple runs
  python checkpoint_viz_cli.py compare run1/ run2/ run3/ --names "Baseline" "High LR" "Strong κ"

  # Show checkpoint info
  python checkpoint_viz_cli.py info level_3_checkpoint.pt

For more information, visit: https://github.com/anthropics/noetic-eidos
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    subparsers.required = True

    # Common arguments
    def add_common_args(p):
        p.add_argument('-o', '--output', type=str, default='./visualization_output',
                      help='Output directory (default: ./visualization_output)')
        p.add_argument('--device', type=str, default=None,
                      help='Device for model loading (cuda/cpu, default: auto)')
        p.add_argument('--dpi', type=int, default=150,
                      help='DPI for saved figures (default: 150)')
        p.add_argument('--format', type=str, nargs='+', default=['png'],
                      choices=['png', 'pdf', 'svg', 'jpg'],
                      help='Output format(s) (default: png)')

    def add_cgd_args(p):
        cgd_group = p.add_argument_group('CGD options')
        cgd_group.add_argument('--cgd', action='store_true',
                              help='Generate CGD decision boundary visualizations')
        cgd_group.add_argument('--sigma', type=float, default=0.5,
                              help='Gaussian kernel width (default: 0.5)')
        cgd_group.add_argument('--t', type=float, default=0.5,
                              help='Poisson sensitivity (default: 0.5)')
        cgd_group.add_argument('--w', type=float, default=0.5,
                              help='Mixing weight τ-σ (default: 0.5)')
        cgd_group.add_argument('--eta', type=float, default=1e-2,
                              help='CGD convergence threshold (default: 0.01)')
        cgd_group.add_argument('--n-samples', type=int, default=800,
                              help='Number of samples for CGD (default: 800)')

    # Checkpoint command
    checkpoint_parser = subparsers.add_parser('checkpoint', help='Visualize single checkpoint')
    checkpoint_parser.add_argument('checkpoint', type=Path,
                                  help='Path to checkpoint file')
    checkpoint_parser.add_argument('--types', type=str, nargs='+',
                                  choices=['geometry', 'history', 'kappa', 'cgd'],
                                  default=['geometry', 'history', 'kappa'],
                                  help='Visualization types to generate')
    checkpoint_parser.add_argument('--all', action='store_true',
                                  help='Generate all visualization types')
    add_common_args(checkpoint_parser)
    add_cgd_args(checkpoint_parser)
    checkpoint_parser.set_defaults(func=cmd_checkpoint)

    # Curriculum command
    curriculum_parser = subparsers.add_parser('curriculum', help='Visualize curriculum progression')
    curriculum_parser.add_argument('checkpoint_dir', type=Path,
                                  help='Directory containing curriculum checkpoints')
    curriculum_parser.add_argument('--types', type=str, nargs='+',
                                  choices=['progression', 'trajectory', 'evolution', 'metrics', 'cgd'],
                                  default=['progression', 'trajectory', 'evolution', 'metrics'],
                                  help='Visualization types to generate')
    curriculum_parser.add_argument('--all', action='store_true',
                                  help='Generate all visualization types')
    curriculum_parser.add_argument('--max-levels', type=int, default=None,
                                  help='Maximum number of levels to visualize (default: all)')
    add_common_args(curriculum_parser)
    add_cgd_args(curriculum_parser)
    curriculum_parser.set_defaults(func=cmd_curriculum)

    # Compare command
    compare_parser = subparsers.add_parser('compare', help='Compare multiple curriculum runs')
    compare_parser.add_argument('run_dirs', type=Path, nargs='+',
                               help='Directories containing curriculum checkpoints')
    compare_parser.add_argument('--names', type=str, nargs='+',
                               help='Names for each run (default: directory names)')
    add_common_args(compare_parser)
    compare_parser.set_defaults(func=cmd_compare)

    # Report command
    report_parser = subparsers.add_parser('report', help='Generate comprehensive curriculum report')
    report_parser.add_argument('checkpoint_dir', type=Path,
                              help='Directory containing curriculum checkpoints')
    add_common_args(report_parser)
    add_cgd_args(report_parser)
    report_parser.set_defaults(func=cmd_report)

    # Info command
    info_parser = subparsers.add_parser('info', help='Display checkpoint information')
    info_parser.add_argument('checkpoint', type=Path,
                            help='Path to checkpoint file or curriculum directory')
    info_parser.set_defaults(func=cmd_info)

    # Parse and execute
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
