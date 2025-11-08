import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

# from zeta_block import ZetaBlock

from zeta_block_enhanced import ZetaBlockEnhanced as ZetaBlock

from ZetaFormer.zeta_losses import ZetaLosses


def train_zeta_block(
    make_dataset_fn,
    d_model=32, n_heads=4, d_ff=64,
    n_epochs=20, batch_size=64,
    lr=1e-3, device="cuda" if torch.cuda.is_available() else "cpu"
):
    # ----- Data -----
    X, y, mask = make_dataset_fn()
    dataset = TensorDataset(X, y, mask)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    # ----- Model & losses -----
    model = ZetaBlock(d_model=d_model, n_heads=n_heads, bootstrap_fixed=False).to("cuda")
    losses = ZetaLosses(lambda_subm=0.1, eta_zero=0.5)

    classifier = nn.Linear(d_model, y.max().item() + 1).to(device)
    optimizer = optim.Adam(list(model.parameters()) + list(classifier.parameters()), lr=lr)

    # ----- Training Loop -----
    for epoch in range(n_epochs):
        total_loss, total_task, total_zero, total_subm, n_batches = 0, 0, 0, 0, 0
        for xb, yb, mb in loader:
            xb, yb, mb = xb.to(device), yb.to(device), mb.to(device)

            # Forward pass (with components)
            out, f, tau, sigma = model(xb, return_components=True)
            logits = classifier(out)

            # Loss
            L, parts = losses(logits, yb, f, tau, sigma, mb)

            optimizer.zero_grad()
            L.backward()
            optimizer.step()

            total_loss += L.item()
            total_task += parts["task"]
            total_zero += parts["zero"]
            n_batches += 1

        print(f"Epoch {epoch+1}/{n_epochs} "
              f"Total={total_loss/n_batches:.3f} "
              f"Task={total_task/n_batches:.3f} "
              f"Zero={total_zero/n_batches:.3f} ")

    return model, classifier

# Recreate architecture
model = ZetaBlock(d_model=32, n_heads=4, )
classifier = nn.Linear(32, 2)  # 2 classes: inner vs outer
