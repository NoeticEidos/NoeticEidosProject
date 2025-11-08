"""
Example: Saving and Loading ζ-normalized Models

Demonstrates:
1. Training a ζ-normalized model
2. Saving with full checkpoint (weights + metrics + state)
3. Loading and resuming inference
4. Inspecting saved metrics and hyperparameters

Author: Noetic Eidos Project
License: MIT
"""

import torch
import numpy as np
from training_loop_enhanced import train_zeta_block, save_zeta_model, load_zeta_model


def make_toy_dataset():
    """Create a simple classification dataset for demonstration."""
    torch.manual_seed(42)
    n_samples = 500
    seq_len = 20
    d_model = 32

    X = torch.randn(n_samples, seq_len, d_model)
    y = torch.randint(0, 2, (n_samples, seq_len))
    mask = torch.ones(n_samples, seq_len, dtype=torch.bool)

    return X, y, mask


def train_and_save_example():
    """Train a model and save it."""
    print("="*80)
    print("Training ζ-normalized Model")
    print("="*80)

    # Train model
    model, classifier, metrics = train_zeta_block(
        make_dataset_fn=make_toy_dataset,
        d_model=32,
        n_heads=4,
        n_epochs=10,
        batch_size=32,
        lr=1e-3,
        enable_zeta_norm=True,
        kappa_strength=0.05,
        verbose=True,
    )

    # Save model
    save_path = './checkpoints/zeta_model_example.pt'
    hyperparameters = {
        'd_model': 32,
        'n_heads': 4,
        'n_epochs': 10,
        'batch_size': 32,
        'lr': 1e-3,
        'kappa_strength': 0.05,
        'enable_zeta_norm': True,
    }

    print("\n" + "="*80)
    print("Saving Model")
    print("="*80)
    save_zeta_model(model, classifier, metrics, save_path, hyperparameters)

    return save_path


def load_and_inspect_example(save_path: str):
    """Load a saved model and inspect its state."""
    print("\n" + "="*80)
    print("Loading Model")
    print("="*80)

    # Load model
    model, classifier, metrics_dict, hparams = load_zeta_model(save_path)

    # Inspect hyperparameters
    print("\n" + "="*80)
    print("Hyperparameters:")
    print("="*80)
    for key, val in hparams.items():
        print(f"  {key:20s}: {val}")

    # Inspect training metrics summary
    print("\n" + "="*80)
    print("Training Summary:")
    print("="*80)
    summary = metrics_dict['summary']
    for key, val in summary.items():
        print(f"  {key:20s}: {val:.4f}")

    # Inspect ζ-normalization state
    print("\n" + "="*80)
    print("ζ-Normalization State:")
    print("="*80)
    print(f"  Offset m*:           {model.zeta_translator.offset:.4f}")
    print(f"  κζ smooth state:     {model.kappa_smooth:.4f}" if model.kappa_smooth else "  κζ smooth state:     None")
    print(f"  κζ history length:   {len(model.kappa_log)}")
    print(f"  Raw κζ history len:  {len(model.kappa_raw_log)}")

    # Inspect final epoch metrics
    print("\n" + "="*80)
    print("Final Epoch Metrics:")
    print("="*80)
    if metrics_dict['epoch_kappa']:
        kappa_final = np.mean(metrics_dict['epoch_kappa'][-1])
        kappa_raw_final = np.mean(metrics_dict['epoch_kappa_raw'][-1])
        offset_final = metrics_dict['epoch_offset'][-1][-1]
        print(f"  κζ_calibrated:       {kappa_final:.4f}")
        print(f"  κζ_raw:              {kappa_raw_final:.4f}")
        print(f"  Offset m*:           {offset_final:.4f}")

    # Run inference on a sample
    print("\n" + "="*80)
    print("Running Inference:")
    print("="*80)
    model.eval()
    with torch.no_grad():
        X_test = torch.randn(1, 20, 32)
        output = model(X_test)
        logits = classifier(output)
        predictions = logits.argmax(dim=-1)

        print(f"  Input shape:         {X_test.shape}")
        print(f"  Output shape:        {output.shape}")
        print(f"  Logits shape:        {logits.shape}")
        print(f"  Predictions:         {predictions.shape}")
        print(f"  Sample predictions:  {predictions[0, :10].tolist()}")

    return model, classifier


def compare_models_example(original_path: str):
    """Train a new model and compare with loaded checkpoint."""
    print("\n" + "="*80)
    print("Training New Model for Comparison")
    print("="*80)

    # Train fresh model (same hyperparameters)
    model_new, clf_new, metrics_new = train_zeta_block(
        make_dataset_fn=make_toy_dataset,
        d_model=32,
        n_heads=4,
        n_epochs=10,
        batch_size=32,
        lr=1e-3,
        enable_zeta_norm=True,
        kappa_strength=0.05,
        verbose=False,
    )

    # Load original model
    model_loaded, clf_loaded, _, _ = load_zeta_model(original_path)

    # Compare final losses
    print("\n" + "="*80)
    print("Model Comparison:")
    print("="*80)
    print(f"  Loaded model loss:   {metrics_new.epoch_loss[-1]:.4f}")
    print(f"  New model loss:      {metrics_new.epoch_loss[-1]:.4f}")
    print(f"  (Same seed, should be identical)")

    # Compare parameter counts
    loaded_params = sum(p.numel() for p in model_loaded.parameters())
    new_params = sum(p.numel() for p in model_new.parameters())
    print(f"\n  Loaded params:       {loaded_params:,}")
    print(f"  New params:          {new_params:,}")


if __name__ == "__main__":
    print("ζ-Normalized Model Save/Load Example\n")

    # Step 1: Train and save
    save_path = train_and_save_example()

    # Step 2: Load and inspect
    model, classifier = load_and_inspect_example(save_path)

    # Step 3: Compare with fresh training
    compare_models_example(save_path)

    print("\n" + "="*80)
    print("Example Complete!")
    print("="*80)
    print(f"\nModel checkpoint saved at: {save_path}")
    print("\nYou can now:")
    print("  1. Load this model in other scripts")
    print("  2. Resume training from this checkpoint")
    print("  3. Deploy for inference")
    print("  4. Analyze training metrics offline")