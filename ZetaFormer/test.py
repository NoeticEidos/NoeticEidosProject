# cg_zeta_demo.py
import math
import torch
import matplotlib.pyplot as plt

# ----- 0) Utilities -----

def row_normalize(mat, eps=1e-12):
    return mat / (mat.sum(dim=1, keepdim=True) + eps)

def pairwise_sq_dists(X, Y=None):
    # X: (n,d), Y: (m,d) -> (n,m) distances^2
    if Y is None: Y = X
    XX = (X*X).sum(dim=1, keepdim=True)         # (n,1)
    YY = (Y*Y).sum(dim=1, keepdim=True).T       # (1,m)
    return torch.clamp(XX + YY - 2*X@Y.T, min=0.0)

def gaussian_kernel_from_points(X, Y, sigma):
    # heat/diffusion kernel ~ exp(-||x-y||^2/(2σ^2))
    D2 = pairwise_sq_dists(X, Y)
    K = torch.exp(- D2 / (2.0 * sigma**2))
    return row_normalize(K)

def poisson_kernel_from_points(X, Y, t):
    # transport kernel ~ 1/(||x-y||^2 + t^2)  (algebraic tails)
    D2 = pairwise_sq_dists(X, Y)
    K = 1.0 / (D2 + t**2)
    return row_normalize(K)

# Conjugate-Gradient solve for (A^T A + eta I) f = A^T y
def cg_solve(A_apply, AT_apply, y, eta=1e-3, tol=1e-6, max_iter=500):
    """
    A_apply:  lambda v -> A v
    AT_apply: lambda v -> A^T v
    Solve normal equations with CG on the operator N(v)=(A^T A + eta I)v.
    """
    def normal_op(v):
        return AT_apply(A_apply(v)) + eta * v

    f = torch.zeros_like(y)             # initial guess
    r = AT_apply(y) - normal_op(f)      # r0 = A^T y - (A^T A + eta I) f0
    p = r.clone()
    rs_old = torch.dot(r.flatten(), r.flatten())

    for it in range(max_iter):
        Ap = normal_op(p)
        denom = torch.dot(p.flatten(), Ap.flatten()) + 1e-12
        alpha = rs_old / denom
        f = f + alpha * p
        r = r - alpha * Ap
        rs_new = torch.dot(r.flatten(), r.flatten())
        if torch.sqrt(rs_new) < tol:
            break
        p = r + (rs_new/rs_old) * p
        rs_old = rs_new
    return f

# ----- 1) Datasets -----

def make_ellipses_dataset(n=2000,
                          a_inner=1.0, b_inner=0.5,
                          a_outer=2.0, b_outer=1.0,
                          noise=0.05, seed=0):
    torch.manual_seed(seed)
    n_in = n//2
    n_out = n - n_in
    th_in = 2*math.pi*torch.rand(n_in)
    th_out = 2*math.pi*torch.rand(n_out)
    X_in = torch.stack([a_inner*torch.cos(th_in), b_inner*torch.sin(th_in)], dim=1)
    X_out= torch.stack([a_outer*torch.cos(th_out), b_outer*torch.sin(th_out)], dim=1)
    X_in += noise*torch.randn_like(X_in)
    X_out+= noise*torch.randn_like(X_out)
    X = torch.cat([X_in, X_out], dim=0)
    y = torch.cat([torch.zeros(n_in), torch.ones(n_out)], dim=0)  # 0/1 labels
    # shuffle
    idx = torch.randperm(n)
    return X[idx], y[idx]

def make_circles_dataset(n=2000, r_in=1.0, r_out=2.0, noise=0.05, seed=0):
    torch.manual_seed(seed)
    n_in = n//2
    n_out = n - n_in
    th_in = 2*math.pi*torch.rand(n_in)
    th_out = 2*math.pi*torch.rand(n_out)
    X_in = torch.stack([r_in*torch.cos(th_in), r_in*torch.sin(th_in)], dim=1)
    X_out= torch.stack([r_out*torch.cos(th_out), r_out*torch.sin(th_out)], dim=1)
    X_in += noise*torch.randn_like(X_in)
    X_out+= noise*torch.randn_like(X_out)
    X = torch.cat([X_in, X_out], dim=0)
    y = torch.cat([torch.zeros(n_in), torch.ones(n_out)], dim=0)  # 0/1 labels
    idx = torch.randperm(n)
    return X[idx], y[idx]

# ----- 2) Build operator S = 1/2 Gauss + 1/2 Poisson -----

def build_S(X_train, X_basis=None, sigma=0.5, t=0.5, w=0.5):
    """
    Build linear operator S that maps coefficients f (on basis points) -> Smoothed values on train points.
    If X_basis is None, use X_train (Nyström with full basis).
    """
    if X_basis is None:
        X_basis = X_train
    G = gaussian_kernel_from_points(X_train, X_basis, sigma)
    P = poisson_kernel_from_points(X_train, X_basis, t)
    S = w*G + (1.0 - w)*P     # w=0.5 → fixed Mellin 1/2-1/2
    return S, X_basis

# ----- 3) Fit via CG -----

def fit_cg(X_train, y_train, sigma=0.5, t=0.5, w=0.5, eta=1e-3):
    """
    Solve min_f ||S f - y||^2 + eta ||f||^2 with CG.
    Returns:
      f: (n_basis,) coefficients living on X_basis
      S: (n_train, n_basis) operator
      X_basis: basis points (for out-of-sample eval)
    """
    y = (2*y_train - 1).to(torch.float64)  # map labels 0/1 -> -1/+1 for zero-level set
    X_train = X_train.to(torch.float64)

    S, X_basis = build_S(X_train, None, sigma, t, w)  # (n, n)
    S = S.to(torch.float64)

    # Define A and A^T
    A_apply  = lambda v: S @ v                          # (n,) -> (n,)
    AT_apply = lambda v: S.T @ v                        # (n,) -> (n,)

    f = cg_solve(A_apply, AT_apply, y, eta=eta, tol=1e-8, max_iter=2000)
    return f, S, X_basis

# ----- 4) Predict & evaluate -----

def predict_scores(X_query, X_basis, f, sigma=0.5, t=0.5, w=0.5):
    """
    Evaluate g(x) = (S_query f)(x) on query points.
    """
    X_query = X_query.to(torch.float64)
    X_basis = X_basis.to(torch.float64)
    Gq = gaussian_kernel_from_points(X_query, X_basis, sigma)
    Pq = poisson_kernel_from_points(X_query, X_basis, t)
    Sq = (w*Gq + (1.0 - w)*Pq).to(torch.float64)         # (m, n_basis)
    g = Sq @ f                                           # (m,)
    return g.to(torch.float32)

def accuracy_from_scores(scores, y_true):
    # scores ~ signed margin (we trained on y∈{-1,+1}); classify by sign -> 0/1
    y_pred = (scores >= 0).to(y_true.dtype)
    return (y_pred == y_true).float().mean().item()

# ----- 5) Visualization -----

def plot_zero_set_2d(X_train, y_train, X_basis, f, sigma=0.5, t=0.5, w=0.5,
                     a_inner=None, b_inner=None, a_outer=None, b_outer=None,
                     r_inner=None, r_outer=None, title="‖f‖ zero set"):
    # Heatmap of scores over grid; overlay ellipses/circles if provided
    grid = 220
    gx, gy = torch.meshgrid(
        torch.linspace(-3, 3, grid),
        torch.linspace(-3, 3, grid),
        indexing="xy"
    )
    Gpts = torch.stack([gx.flatten(), gy.flatten()], dim=1)  # (grid^2, 2)
    scores = predict_scores(Gpts, X_basis, f, sigma, t, w).reshape(gx.shape)

    plt.figure(figsize=(6.4, 6))
    # contour where score is near zero (decision boundary)
    cs = plt.contour(gx.numpy(), gy.numpy(), scores.numpy(), levels=[0.0], colors='k')
    plt.contourf(gx.numpy(), gy.numpy(), scores.numpy(), levels=50, cmap="RdBu", alpha=0.65)
    plt.colorbar(label="score (≈ S f)")

    # overlay training points
    mask0 = (y_train == 0)
    mask1 = (y_train == 1)
    plt.scatter(X_train[mask0,0], X_train[mask0,1], s=10, c="#2c7bb6", label="class 0", alpha=0.7)
    plt.scatter(X_train[mask1,0], X_train[mask1,1], s=10, c="#d7191c", label="class 1", alpha=0.7)

    # overlay ground-truth curves if provided
    th = torch.linspace(0, 2*math.pi, 400)
    if (a_inner is not None) and (b_inner is not None):
        xi = a_inner*torch.cos(th); yi = b_inner*torch.sin(th)
        plt.plot(xi, yi, "k--", lw=1, label="inner (true)")
    if (a_outer is not None) and (b_outer is not None):
        xo = a_outer*torch.cos(th); yo = b_outer*torch.sin(th)
        plt.plot(xo, yo, "k--", lw=1, label="outer (true)")
    if (r_inner is not None):
        xi = r_inner*torch.cos(th); yi = r_inner*torch.sin(th)
        plt.plot(xi, yi, "k--", lw=1, label="inner circle")
    if (r_outer is not None):
        xo = r_outer*torch.cos(th); yo = r_outer*torch.sin(th)
        plt.plot(xo, yo, "k--", lw=1, label="outer circle")

    plt.title(title)
    plt.xlabel("x"); plt.ylabel("y"); plt.axis("equal"); plt.legend(loc="best")
    plt.tight_layout()
    plt.show()

# ----- 6) Run an experiment -----

if __name__ == "__main__":
    torch.set_default_dtype(torch.float32)

    # Choose dataset: ELLIPSES (asymmetry) or CIRCLES (symmetry)
    use_ellipses = False

    if use_ellipses:
        X, y = make_ellipses_dataset(n=2000, a_inner=1.0, b_inner=0.5,
                                     a_outer=2.0, b_outer=1.0, noise=0.05, seed=42)
        gt = dict(a_inner=1.0, b_inner=0.5, a_outer=2.0, b_outer=1.0)
        title = "Gaussian–Poisson CG (ellipses)"
    else:
        X, y = make_circles_dataset(n=2000, r_in=1.0, r_out=2.0, noise=0.05, seed=42)
        gt = dict(r_inner=1.0, r_outer=2.0)
        title = "Gaussian–Poisson CG (circles)"

    # Train/test split
    n = X.shape[0]
    n_train = int(0.7*n)
    X_train, y_train = X[:n_train], y[:n_train]
    X_test,  y_test  = X[n_train:], y[n_train:]

    # Hyperparams (play with these):
    sigma = 0.5      # Gaussian bandwidth
    t     = 0.5      # Poisson scale
    w     = 0.5      # Mellin mix (½–½)
    eta   = 1e-2     # Tikhonov regularization

    # Solve with CG
    f, S, X_basis = fit_cg(X_train, y_train, sigma=sigma, t=t, w=w, eta=eta)

    # Train accuracy (evaluate S f vs y)
    scores_train = (S @ f).to(torch.float32)
    acc_train = accuracy_from_scores(scores_train, y_train)
    # Test accuracy (out-of-sample via kernels to train basis)
    scores_test  = predict_scores(X_test, X_basis, f, sigma=sigma, t=t, w=w)
    acc_test = accuracy_from_scores(scores_test, y_test)

    print(f"train acc: {acc_train:.3f} | test acc: {acc_test:.3f}")

    # Visualize learned zero set
    plot_zero_set_2d(X_train, y_train, X_basis, f, sigma=sigma, t=t, w=w, title=title, **gt)
