import torch

from ZetaFormer.training_loop import train_zeta_block

import torch

def make_ellipses_dataset(n_samples=1000,
                          a_inner=1.0, b_inner=0.5,
                          a_outer=2.0, b_outer=1.0,
                          noise=0.05, d_model=32,
                          return_W=False):
    """
    Generate 2D concentric ellipses dataset, embed into d_model space.
    Inner ellipse = class 0, outer ellipse = class 1.
    """
    B = n_samples
    N = 1   # one token per example
    D = d_model

    # Half points inner ellipse
    n_inner = n_samples // 2
    theta_inner = 2 * torch.pi * torch.rand(n_inner)
    x_inner = torch.stack([
        a_inner * torch.cos(theta_inner) + noise * torch.randn(n_inner),
        b_inner * torch.sin(theta_inner) + noise * torch.randn(n_inner)
    ], dim=1)

    # Half points outer ellipse
    n_outer = n_samples - n_inner
    theta_outer = 2 * torch.pi * torch.rand(n_outer)
    x_outer = torch.stack([
        a_outer * torch.cos(theta_outer) + noise * torch.randn(n_outer),
        b_outer * torch.sin(theta_outer) + noise * torch.randn(n_outer)
    ], dim=1)

    # Concatenate
    X_2d = torch.cat([x_inner, x_outer], dim=0)  # (B,2)
    y = torch.cat([
        torch.zeros(n_inner, dtype=torch.long),
        torch.ones(n_outer, dtype=torch.long)
    ], dim=0)

    # Embed into d_model space with random linear map
    W_embed = torch.randn(2, d_model)
    X_embed = X_2d @ W_embed  # (B,D)

    # Reshape to transformer input shape (B,N,D)
    X = X_embed.unsqueeze(1)
    y = y.unsqueeze(1)
    mask = torch.ones_like(y, dtype=torch.bool)

    if return_W:
        return X, y, mask, W_embed
    return X, y, mask

def make_circles_dataset(n_samples=1000, radius_inner=1.0, radius_outer=2.0, noise=0.05, d_model=32):
    """
    Generate 2D concentric circles dataset, embed into d_model space.
    Returns X (B,N,D), y (B,N), mask (B,N).
    """
    B = n_samples
    N = 1   # one token per example
    D = d_model

    # Half points inner circle
    n_inner = n_samples // 2
    theta_inner = 2 * torch.pi * torch.rand(n_inner)
    r_inner = radius_inner + noise * torch.randn(n_inner)
    x_inner = torch.stack([r_inner * torch.cos(theta_inner),
                           r_inner * torch.sin(theta_inner)], dim=1)

    # Half points outer circle
    n_outer = n_samples - n_inner
    theta_outer = 2 * torch.pi * torch.rand(n_outer)
    r_outer = radius_outer + noise * torch.randn(n_outer)
    x_outer = torch.stack([r_outer * torch.cos(theta_outer),
                           r_outer * torch.sin(theta_outer)], dim=1)

    # Concatenate
    X_2d = torch.cat([x_inner, x_outer], dim=0)  # (B,2)
    y = torch.cat([torch.zeros(n_inner, dtype=torch.long),
                   torch.ones(n_outer, dtype=torch.long)], dim=0)  # (B,)

    # Embed into d_model with random linear map
    W_embed = torch.randn(2, d_model)
    X_embed = X_2d @ W_embed    # (B, D)

    # Reshape to transformer input shape (B,N,D)
    X = X_embed.unsqueeze(1)  # one "token" per sample
    y = y.unsqueeze(1)        # (B,1)
    mask = torch.ones_like(y, dtype=torch.bool)

    return X, y, mask

model, clf = train_zeta_block(
    make_dataset_fn=lambda: make_ellipses_dataset(n_samples=2000, d_model=32),
    d_model=32, n_heads=4, d_ff=64,
    n_epochs=10, batch_size=64,
)

def evaluate_accuracy(model, classifier, make_dataset_fn, device="cuda"):
    model.eval()
    classifier.eval()
    X, y, mask = make_dataset_fn()
    X, y = X.to(device), y.to(device)

    with torch.no_grad():
        out, f, tau, sigma = model(X, return_components=True)
        logits = classifier(out)
        preds = logits.argmax(dim=-1)
        acc = (preds == y).float().mean().item()
    return acc

r=evaluate_accuracy(model, clf, make_circles_dataset)
print(f"====={r}======")