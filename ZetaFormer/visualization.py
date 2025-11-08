import torch
from torch import nn
import matplotlib.pyplot as plt

from ZetaFormer.zeta_block import ZetaBlock

def plot_circles_decision(model, embed_matrix, radius_inner=1.0, radius_outer=2.0, device="cpu"):
    model.eval()

    # Make grid
    grid_x, grid_y = torch.meshgrid(
        torch.linspace(-3, 3, 200),
        torch.linspace(-3, 3, 200),
        indexing="xy"
    )
    points_2d = torch.stack([grid_x.flatten(), grid_y.flatten()], dim=1)  # (num_points, 2)

    # Embed into d_model space
    X_embed = points_2d @ embed_matrix  # (num_points, D)
    X = X_embed.unsqueeze(1).to(device) # (B,N=1,D)

    # Forward through model
    with torch.no_grad():
        _, f, tau, sigma = model(X, return_components=True)
    f_norm = f.norm(dim=-1).cpu().numpy().reshape(grid_x.shape)  # (200,200)

    # Plot
    plt.figure(figsize=(6,6))
    plt.contourf(grid_x.numpy(), grid_y.numpy(), f_norm, levels=50, cmap="viridis")
    plt.colorbar(label="‖f(h)‖")

    # Overlay true circles
    circle_inner = plt.Circle((0,0), radius_inner, color="red", fill=False, linestyle="--")
    circle_outer = plt.Circle((0,0), radius_outer, color="blue", fill=False, linestyle="--")
    plt.gca().add_artist(circle_inner)
    plt.gca().add_artist(circle_outer)

    plt.title("Zero-set geometry (‖f(h)‖) with true circles")
    plt.xlabel("x")
    plt.ylabel("y")
    plt.axis("equal")
    plt.show()

# Recreate architecture
model = ZetaBlock(d_model=32, n_heads=4, bootstrap_fixed=True)
classifier = nn.Linear(32, 2)  # 2 classes: inner vs outer


plot_circles_decision(model, embed_matrix, radius_inner=1.0, radius_outer=2.0)

