# Spillway Designer

**[Launch the Spillway Designer](https://biswashk920.github.io/spillway-lab/)**

An interactive tool for exploring the hydraulic design of an **ogee (WES) spillway**. Adjust the design parameters and see how the spillway profile, flow conditions, hydraulic jump, and stilling basin respond.

The tool brings together the main calculations and a visual representation of the spillway in one place, making it useful for learning, preliminary design, and exploring different hydraulic conditions.

## Features

- **Ogee crest:** WES crest profile with upstream and downstream transitions.
- **Design discharge:** Calculates discharge using the design head, effective crest length, and approach velocity.
- **Water surface profile:** Estimates flow depth along the spillway chute using the standard-step method and Manning's equation.
- **Hydraulic jump:** Calculates sequent depth and estimates the jump location based on tailwater conditions.
- **Radial gate:** Optional gate with orifice and free-crest discharge calculations.
- **Stilling basin:** Compare a plain basin with a USBR Type III basin, including chute blocks, baffle blocks, and an end sill.
- **Piers:** Account for pier and abutment contractions in the effective crest length.

All calculations use SI units.

## Reference calculations and testing

The project includes a Jupyter notebook containing the reference calculations, 19 verification checks, and exported test cases.

- `notebook/spillway_design.ipynb` — Reference calculations and design inputs.
- `web/` — Interactive web application.
- `web/engine.js` — JavaScript calculation engine.
- `tests/engine.test.js` — Tests comparing the JavaScript engine against the notebook's results.

The JavaScript engine is checked against 12 test cases, comparing 768 numerical values to a relative tolerance of `1e-6`.

## Run locally

Clone the repository and open `web/index.html` in your browser, or serve the application locally:

```bash
python -m http.server -d web 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

No build step or JavaScript dependencies are required.

### Run the notebook

Open `notebook/spillway_design.ipynb` in Jupyter and select **Restart & Run All**.

The notebook requires:

```bash
pip install numpy matplotlib
```

Edit the inputs in Section 2 to explore different design conditions. The notebook generates the following files in `notebook/outputs/`:

- `test_cases.json`
- `profile.csv`
- `rating_curve.csv`

### Run the tests

With Node.js installed, run:

```bash
node tests/engine.test.js
```

## Assumptions and limitations

This is a teaching and preliminary-design tool, not a substitute for a detailed hydraulic analysis or professional engineering review.

The calculations use simplified one-dimensional flow assumptions and do not model air entrainment. The contraction and discharge-coefficient tables, low-dam correction, and USBR Type III basin proportions are approximate and should be checked against the original design references.

The tool does not cover stepped chutes, labyrinth spillways, side-channel spillways, crest submergence, scour analysis, or structural stability.

For real structures, consult the relevant USACE and USBR design guidance and have the results reviewed by a qualified dam engineer.

## References

- USACE, *EM 1110-2-1603: Hydraulic Design of Spillways*
- USBR, *Engineering Monograph No. 25: Hydraulic Design of Stilling Basins and Energy Dissipators*

## Deployment

The application is hosted on GitHub Pages. The GitHub Actions workflow runs the tests and deploys the contents of `web/` whenever changes are pushed to the `main` branch.

## Keeping the calculations consistent

The notebook is the reference implementation, and `web/engine.js` is its JavaScript counterpart. When changing the hydraulic calculations, update both implementations, regenerate the test cases, and run the test suite.

---

**Author:** [Biswash Kaphle](https://github.com/biswashk920)  
**Repository:** [biswashk920/spillway-lab](https://github.com/biswashk920/spillway-lab)
