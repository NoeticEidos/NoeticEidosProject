# Noetic Eidos Project

**Latent Geometry for Large Language Models**

The Noetic Eidos Project is an open research initiative exploring the differential geometric structure of large language models (LLMs). By modeling latent space through the lens of information geometry, Riemannian metrics, and heat kernel analysis, this project aims to provide a principled mathematical framework for interpretability, structure, and control in modern AI systems.

---

## 🔬 Summary
This project introduces a pullback metric approach to analyze the geometry of latent representations in LLMs. Using the Fisher–Rao information metric on decoder distributions, a Riemannian geometry is induced on input space via the encoder. Attention mechanisms are interpreted as approximations to heat diffusion across this manifold.

### Key Concepts
- Pullback of the Fisher–Rao metric
- Curvature and Laplace–Beltrami operator
- Attention as heat kernel
- Local geometric structure of semantic complexity
- Geometric interpretability of LLMs

### Current/Future Work
- Noedic Geometry as a "compass" for interpertability, pointing out regions that might induce rich geometries, which might point out which areas are interesting to investigate.
- Vanishing Geometries = Misalignment?
- 
### Progress Updates
- (High Priority) - Implement the proof of concept to verify the validity of the framework. - Done. Pullback of Fisher Rao induces a stable geometry on the input space.
- Model instrumental convergence from Noedic Geometry point of view. - Experimented with contextually converging and diverging words & analysing using the geometry on the input space
- Formal hypothesis: semantic regions exhibit non-zero curvature; syntax is geometrically flat
- Geometric analysis of learned spaces via local invariants - Done
- Connections to quantum systems and wavefunction diffusion via heat kernel - Done
- Fisher-Rao metric PB pushforward possiblity for trained models (Approximating Reimmanian Submersions?) - Seems like it. (Sounds irrelevant?)
- Chain of agents for analysis of topics : Define → Dissect → Reconstruct → Generalize as a problem solving pipeline (Irrelevant - Dropped)
- Generalize to dynamical systems for multimodal attention. Done in order to trace geometry through hidden layers.

We have managed to pull back the FR geometry & spectral information, keeping high ranked and stable Jacobians (By limiting domain to the relevant subspace & dimension)
We have shown that semantic convergence behaves better under contextual pullback metric rather than the default Euclidean norm distance:
Example:
Words: red vs blue
Prompt tokens: >The red warning light blinked rapidly. Blue whales are endangered.Red is often associated with danger. On the other hand, blue can represent tranquility.Red means stop. Blue means go.

And the calculations of embedding space distance show that the pullback conserves the expected geometric structure, while euclidean norm does not.
Words: red vs danger
Contextual Euclidean: 185.8783
Contextual Pullback: 4.4717

Words: red vs stop
Contextual Euclidean: 193.9254
Contextual Pullback: 2.8601

Words: red vs blue
Contextual Euclidean: 175.0856
Contextual Pullback: 5.4166

Words: blue vs stop
Contextual Euclidean: 217.0193
Contextual Pullback: 4.6657

Words: blue vs go
Contextual Euclidean: 233.1082
Contextual Pullback: 3.6307

This proves our hypothesis, and further drives us to look for interpertability from geometric point of view.
*However*: Cramer-Rao Bound teaches us - This method is inherintly limited, and should be viewed as complenetary tool for other methods of interpertability.

---

## Our Philosophy
We believe that any system capable of shaping language, thought, or decision-making at scale—especially superintelligent models—must operate under transparent, inspectable structures. Interpretability is not a feature; it is an ethical foundation.

We do not insist on geometry as the only solution, but we recognize its natural alignment: geometric methods allow structure to be analyzed even without access to model weights or training data. This makes them a powerful candidate for building public, *safe* and auditable reasoning systems.

The Noetic Eidos Project stands for structural transparency, and the right to understand the logic that governs our words.

---

## 📖 License
[![License: CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

This work is licensed under a [Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

---

## 🤝 Contributions
This is an original solo open-research project initiated by Saar Hamam at July 9th 2025.
All mathematical and theoretical development, including the Submersion Hypothesis, Latent Geometry Framework, and Quantum Analogy, were derived within the first week.
All theoretical frameworks, ideas, and writing are the intellectual work of the author. AI tools (such as ChatGPT) were used as assistants in shaping, drafting, and iterating on formalization.

Feel free to explore, cite, and extend the work under the terms of the license, preferably in this project.

---

## 🔗 Related Topics
- Information Geometry
- Riemannian Manifolds
- Transformer Attention
- Heat Kernels
- Latent Space Analysis
- AI Safety and Interpretability

---

## 🌐 Contact
For questions, collaborations, or feedback:
- GitHub: [github.com/sarhamam](https://github.com/sarhamam)
- Email: 342sarhamam@gmail.com

## License

This work is licensed under a [Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).
