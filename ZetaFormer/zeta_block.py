import torch
import torch.nn as nn
import torch.nn.functional as F
class ZetaBlock(nn.Module):
    def __init__(self, d_model, n_heads):
        super().__init__()
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_head = d_model // n_heads

        # Linear projections
        self.W_Q = nn.Linear(d_model, d_model)
        self.W_K = nn.Linear(d_model, d_model)
        self.W_V = nn.Linear(d_model, d_model)
        self.W_O = nn.Linear(d_model, d_model)

        # Poisson parameters (shared across heads)
        self.poisson_beta = nn.Parameter(torch.ones(n_heads))
        self.poisson_t = nn.Parameter(torch.ones(n_heads))

        # Normalization
        self.norm = nn.LayerNorm(d_model)

    def forward(self, x, return_components=False):
        B, N, D = x.shape

        # Shared projections
        Q = self.W_Q(x).view(B, N, self.n_heads, self.d_head).transpose(1, 2)  # (B,H,N,d_h)
        K = self.W_K(x).view(B, N, self.n_heads, self.d_head).transpose(1, 2)
        V = self.W_V(x).view(B, N, self.n_heads, self.d_head).transpose(1, 2)

        # Shared similarity matrix
        S = torch.matmul(Q, K.transpose(-2, -1)) / (self.d_head ** 0.5)  # (B,H,N,N)

        # Gaussian weights
        W_tau = F.softmax(S, dim=-1)

        # Poisson weights
        beta = self.poisson_beta.view(1, self.n_heads, 1, 1)
        t = self.poisson_t.view(1, self.n_heads, 1, 1)
        W_sigma = 1.0 / (((1 + S.abs()/beta)**2) + t**2)
        W_sigma = W_sigma / W_sigma.sum(dim=-1, keepdim=True)

        # Apply to V
        tau = torch.matmul(W_tau, V)   # (B,H,N,d_h)
        sigma = torch.matmul(W_sigma, V)

        # Reshape back
        tau = tau.transpose(1, 2).contiguous().view(B, N, D)
        sigma = sigma.transpose(1, 2).contiguous().view(B, N, D)

        # Symmetric combiner
        f = 0.5 * tau + 0.5 * sigma

        # Residual update
        out = x + self.norm(self.W_O(f))

        if return_components:
            return out, f, tau, sigma
        else:
            return out
