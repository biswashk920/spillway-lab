# Water Hammer Simulator
Reservoir–pipe–valve transient, Method of Characteristics (explicit friction, Courant number 1).
- `web/` – static site (open `web/index.html`, or publish the `web` folder on GitHub Pages).
- `python/moc.py` – reference solver + tests (`python3 moc.py`), then `node web/test_js.js` checks the JS port to 1e-8.
Validated: steady state, Joukowsky peak and 4L/a period, Michaud slow-closure bound, grid convergence, friction decay.
Limits: no cavitation/column separation (flagged in UI), quasi-steady friction, single pipe.
