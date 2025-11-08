"""
Deep Checkpoint Structure Analysis

This script thoroughly analyzes the curriculum checkpoint structure
to understand how data is stored and accessed.
"""

import torch
import numpy as np
from pathlib import Path
import json

def analyze_checkpoint(checkpoint_path):
    """Deeply analyze a single checkpoint."""
    print(f"\n{'='*80}")
    print(f"Analyzing: {Path(checkpoint_path).name}")
    print(f"{'='*80}\n")

    # Load checkpoint
    ckpt = torch.load(checkpoint_path, map_location='cpu')

    # Top-level keys
    print("TOP-LEVEL KEYS:")
    print("-" * 80)
    for key in ckpt.keys():
        print(f"  {key}")
    print()

    # Analyze each section
    sections = {}

    # 1. Model Config
    if 'model_config' in ckpt:
        print("MODEL_CONFIG:")
        print("-" * 80)
        model_config = ckpt['model_config']
        for key, value in model_config.items():
            print(f"  {key}: {value}")
        sections['model_config'] = model_config
        print()

    # 2. Dataset Config
    if 'dataset_config' in ckpt:
        print("DATASET_CONFIG:")
        print("-" * 80)
        dataset_config = ckpt['dataset_config']
        for key, value in dataset_config.items():
            if isinstance(value, (list, np.ndarray, torch.Tensor)):
                print(f"  {key}: {type(value).__name__} shape={np.array(value).shape}")
            else:
                print(f"  {key}: {value}")
        sections['dataset_config'] = {k: str(v) for k, v in dataset_config.items()}
        print()

    # 3. Curriculum Info
    if 'curriculum_info' in ckpt:
        print("CURRICULUM_INFO:")
        print("-" * 80)
        curriculum_info = ckpt['curriculum_info']
        for key, value in curriculum_info.items():
            if isinstance(value, (list, np.ndarray, torch.Tensor)):
                print(f"  {key}: {type(value).__name__} shape={np.array(value).shape}")
            else:
                print(f"  {key}: {value}")
        sections['curriculum_info'] = {k: str(v) if not isinstance(v, (int, float, str, bool)) else v
                                       for k, v in curriculum_info.items()}
        print()

    # 4. Training Config
    if 'training_config' in ckpt:
        print("TRAINING_CONFIG:")
        print("-" * 80)
        training_config = ckpt['training_config']
        for key, value in training_config.items():
            print(f"  {key}: {value}")
        sections['training_config'] = training_config
        print()

    # 5. Metrics
    if 'metrics' in ckpt:
        print("METRICS:")
        print("-" * 80)
        metrics = ckpt['metrics']
        for key, value in metrics.items():
            if isinstance(value, (list, np.ndarray, torch.Tensor)):
                arr = np.array(value)
                print(f"  {key}: {type(value).__name__} shape={arr.shape}, mean={arr.mean():.6f}")
            else:
                print(f"  {key}: {value}")
        sections['metrics'] = {k: str(v) if isinstance(v, (list, np.ndarray, torch.Tensor)) else v
                              for k, v in metrics.items()}
        print()

    # 6. Metadata
    if 'metadata' in ckpt:
        print("METADATA:")
        print("-" * 80)
        metadata = ckpt['metadata']
        for key, value in metadata.items():
            print(f"  {key}: {value}")
        sections['metadata'] = metadata
        print()

    # 7. Viz Config
    if 'viz_config' in ckpt:
        print("VIZ_CONFIG:")
        print("-" * 80)
        viz_config = ckpt['viz_config']
        for key, value in viz_config.items():
            print(f"  {key}: {value}")
        sections['viz_config'] = viz_config
        print()

    # 8. Model State Dict
    if 'model_state_dict' in ckpt:
        print("MODEL_STATE_DICT:")
        print("-" * 80)
        state_dict = ckpt['model_state_dict']
        print(f"  Total parameters: {len(state_dict)} tensors")
        for i, (key, value) in enumerate(list(state_dict.items())[:5]):
            print(f"  [{i}] {key}: {value.shape}")
        print(f"  ... ({len(state_dict) - 5} more)")
        print()

    # 9. Classifier State Dict
    if 'classifier_state_dict' in ckpt:
        print("CLASSIFIER_STATE_DICT:")
        print("-" * 80)
        classifier = ckpt['classifier_state_dict']
        for key, value in classifier.items():
            print(f"  {key}: {value.shape}")
        print()

    # 10. Optimizer State Dict
    if 'optimizer_state_dict' in ckpt:
        print("OPTIMIZER_STATE_DICT:")
        print("-" * 80)
        optimizer = ckpt['optimizer_state_dict']
        print(f"  Keys: {list(optimizer.keys())}")
        if 'state' in optimizer:
            print(f"  State entries: {len(optimizer['state'])}")
        print()

    return sections


def compare_checkpoints(checkpoint_paths):
    """Compare multiple checkpoints."""
    print("\n" + "="*80)
    print("COMPARING MULTIPLE CHECKPOINTS")
    print("="*80)

    results = []

    for path in checkpoint_paths:
        ckpt = torch.load(path, map_location='cpu')

        info = {
            'file': Path(path).name,
        }

        # Extract key information - handle actual structure
        info.update({
            'n_foci': ckpt.get('n_foci', 'N/A'),
            'stabilized_kappa': ckpt.get('stabilized_kappa', 'N/A'),
            'total_epochs': ckpt.get('total_epochs', 'N/A'),
        })

        # Also check for curriculum_info if it exists
        if 'curriculum_info' in ckpt:
            curr = ckpt['curriculum_info']
            info.update({
                'level': curr.get('level', 'N/A'),
                'kappa_zeta': curr.get('kappa_zeta', 'N/A'),
                'stabilized': curr.get('stabilized', 'N/A'),
            })

        if 'dataset_config' in ckpt:
            ds = ckpt['dataset_config']
            info.update({
                'dataset_n_foci': ds.get('n_foci', 'N/A'),
                'focal_radius': ds.get('focal_radius', 'N/A'),
            })

        if 'metrics' in ckpt:
            met = ckpt['metrics']
            info.update({
                'final_loss': met.get('final_loss', 'N/A'),
                'final_accuracy': met.get('final_accuracy', 'N/A'),
            })

        results.append(info)

    # Print table
    print("\n{:<30} {:<8} {:<12} {:<10} {:<12}".format(
        'Checkpoint', 'Level', 'kappa_zeta', 'n_foci', 'Stabilized'
    ))
    print("-" * 80)

    for r in results:
        print("{:<30} {:<8} {:<12} {:<10} {:<12}".format(
            r['file'][:28],
            str(r.get('level', 'N/A')),
            f"{r.get('kappa_zeta', 'N/A'):.4f}" if isinstance(r.get('kappa_zeta'), (int, float)) else str(r.get('kappa_zeta', 'N/A')),
            str(r.get('n_foci', 'N/A')),
            str(r.get('stabilized', 'N/A'))
        ))

    return results


def extract_kappa_zeta_access_pattern(checkpoint_path):
    """Determine the correct way to access kappa_zeta."""
    print("\n" + "="*80)
    print("KAPPA ZETA ACCESS PATTERN ANALYSIS")
    print("="*80 + "\n")

    ckpt = torch.load(checkpoint_path, map_location='cpu')

    access_paths = []

    # Method 1: curriculum_info.kappa_zeta
    try:
        kz1 = ckpt['curriculum_info']['kappa_zeta']
        access_paths.append({
            'method': "ckpt['curriculum_info']['kappa_zeta']",
            'value': kz1,
            'type': type(kz1).__name__,
            'works': True
        })
        print(f"[OK] Method 1: ckpt['curriculum_info']['kappa_zeta']")
        print(f"  Value: {kz1}")
        print(f"  Type: {type(kz1).__name__}\n")
    except Exception as e:
        access_paths.append({
            'method': "ckpt['curriculum_info']['kappa_zeta']",
            'error': str(e),
            'works': False
        })
        print(f"[FAIL] Method 1: ckpt['curriculum_info']['kappa_zeta']")
        print(f"  Error: {e}\n")

    # Method 1b: stabilized_kappa (direct access)
    try:
        kz1b = ckpt['stabilized_kappa']
        access_paths.append({
            'method': "ckpt['stabilized_kappa']",
            'value': kz1b,
            'type': type(kz1b).__name__,
            'works': True
        })
        print(f"[OK] Method 1b: ckpt['stabilized_kappa']")
        print(f"  Value: {kz1b}")
        print(f"  Type: {type(kz1b).__name__}\n")
    except Exception as e:
        access_paths.append({
            'method': "ckpt['stabilized_kappa']",
            'error': str(e),
            'works': False
        })
        print(f"[FAIL] Method 1b: ckpt['stabilized_kappa']")
        print(f"  Error: {e}\n")

    # Method 2: dataset_config (might have kappa)
    try:
        if 'dataset_config' in ckpt:
            ds = ckpt['dataset_config']
            print(f"Dataset config keys: {list(ds.keys())}")

            # Look for kappa-related keys
            kappa_keys = [k for k in ds.keys() if 'kappa' in k.lower()]
            if kappa_keys:
                print(f"  Found kappa-related keys: {kappa_keys}")
                for key in kappa_keys:
                    print(f"    {key}: {ds[key]}")
            print()
    except Exception as e:
        print(f"  Error checking dataset_config: {e}\n")

    # Method 3: metrics (might have kappa)
    try:
        if 'metrics' in ckpt:
            met = ckpt['metrics']
            kappa_keys = [k for k in met.keys() if 'kappa' in k.lower()]
            if kappa_keys:
                print(f"Metrics with kappa: {kappa_keys}")
                for key in kappa_keys:
                    val = met[key]
                    if isinstance(val, (list, np.ndarray, torch.Tensor)):
                        print(f"  {key}: {type(val).__name__} shape={np.array(val).shape}, last={np.array(val)[-1]}")
                    else:
                        print(f"  {key}: {val}")
            print()
    except Exception as e:
        print(f"  Error checking metrics: {e}\n")

    # Method 4: Check all curriculum_info keys
    try:
        if 'curriculum_info' in ckpt:
            curr = ckpt['curriculum_info']
            print(f"All curriculum_info keys: {list(curr.keys())}")
            for key in curr.keys():
                val = curr[key]
                if isinstance(val, (list, np.ndarray, torch.Tensor)):
                    print(f"  {key}: {type(val).__name__}")
                else:
                    print(f"  {key}: {val} (type: {type(val).__name__})")
            print()
    except Exception as e:
        print(f"  Error: {e}\n")

    return access_paths


if __name__ == "__main__":
    # Analyze a few representative checkpoints
    base_dir = Path('polylipse_curriculum_results')

    if not base_dir.exists():
        print(f"Error: Directory {base_dir} not found")
        exit(1)

    # Get some checkpoint samples
    checkpoints = list(base_dir.glob('level_*_checkpoint.pt'))

    if not checkpoints:
        print(f"Error: No checkpoints found in {base_dir}")
        exit(1)

    # Sample: early, mid, late
    sample_checkpoints = []

    # Early
    early = [c for c in checkpoints if 'level_10_' in c.name or 'level_0_' in c.name]
    if early:
        sample_checkpoints.append(str(early[0]))

    # Mid
    mid = [c for c in checkpoints if 'level_500_' in c.name]
    if mid:
        sample_checkpoints.append(str(mid[0]))
    else:
        # Fallback to any mid-range
        mid_alt = sorted([c for c in checkpoints if int(c.name.split('_')[1]) > 400 and int(c.name.split('_')[1]) < 600])
        if mid_alt:
            sample_checkpoints.append(str(mid_alt[0]))

    # Late
    late = [c for c in checkpoints if 'level_1000_' in c.name]
    if late:
        sample_checkpoints.append(str(late[0]))

    print(f"Found {len(checkpoints)} total checkpoints")
    print(f"Analyzing {len(sample_checkpoints)} representative samples\n")

    # Deep analysis of first checkpoint
    if sample_checkpoints:
        all_sections = analyze_checkpoint(sample_checkpoints[0])

        # Access pattern analysis
        access_info = extract_kappa_zeta_access_pattern(sample_checkpoints[0])

        # Compare multiple checkpoints
        if len(sample_checkpoints) > 1:
            comparison = compare_checkpoints(sample_checkpoints[:5])

        # Save analysis to JSON
        output = {
            'checkpoint_analyzed': Path(sample_checkpoints[0]).name,
            'sections': all_sections,
            'kappa_access_methods': access_info
        }

        with open('checkpoint_structure_analysis.json', 'w') as f:
            json.dump(output, f, indent=2)

        print("\n" + "="*80)
        print("Analysis saved to: checkpoint_structure_analysis.json")
        print("="*80)
