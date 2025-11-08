import torch

# Load a checkpoint
ckpt = torch.load('polylipse_curriculum_results/level_1000_checkpoint.pt')

print("Checkpoint Keys:")
print(list(ckpt.keys()))
print("\n" + "="*60)

# Print metadata
print("\nCheckpoint Metadata:")
for key, value in ckpt.items():
    if key != 'model_state_dict':
        print(f"  {key}: {value}")

print("\n" + "="*60)

# Check model state dict
if 'model_state_dict' in ckpt:
    print("\nModel State Dict Keys:")
    for key in list(ckpt['model_state_dict'].keys())[:10]:
        print(f"  {key}")
    print(f"  ... ({len(ckpt['model_state_dict'])} total)")
