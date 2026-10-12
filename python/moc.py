"""Reference Method-of-Characteristics water hammer solver + validation suite.
Reservoir (upstream) - pipe - valve discharging to atmosphere (downstream). SI units."""
import numpy as np, json
g = 9.81
DEF = dict(L=1000., D=0.3, e=0.008, E=200e9, K=2.2e9, rho=998., nu=0.3, support='anchored',
           f=0.02, V0=1.0, Hres=100., Tc=0.0, law='linear', T=15., N=100)

def wave_speed(p):
    c1 = {'free': 1 - p['nu']/2, 'joints': 1.0}.get(p['support'], 1 - p['nu']**2)
    return np.sqrt((p['K']/p['rho'])/(1 + (p['K']/p['E'])*(p['D']/p['e'])*c1))

def tau(t, Tc, law):
    if law == 'none': return 1.0
    if t >= Tc: return 0.0
    s = t/Tc
    if law == 'two': return 1-0.8*s/0.3 if s < 0.3 else 0.2*(1-(s-0.3)/0.7)
    return 1-s

def simulate(p):
    p = {**DEF, **p}; a = wave_speed(p); N = p['N']; dx = p['L']/N; dt = dx/a
    A = np.pi*p['D']**2/4; B = a/(g*A); R = p['f']*dx/(2*g*p['D']*A*A)
    Q0 = p['V0']*A; x = np.arange(N+1)*dx
    H = p['Hres'] - p['f']*x/p['D']*p['V0']**2/(2*g); Q = np.full(N+1, Q0)
    if H[-1] <= 0: raise ValueError('Steady head at valve <= 0: reduce V0 or friction')
    k = Q0/np.sqrt(H[-1]); steps = int(round(p['T']/dt)); Hf = np.empty((steps+1, N+1)); Hf[0] = H
    Qv = np.empty(steps+1); Qv[0] = Q0
    for n in range(1, steps+1):
        cp = H[:-1] + B*Q[:-1] - R*Q[:-1]*np.abs(Q[:-1])   # C+ from node i-1
        cm = H[1:] - B*Q[1:] + R*Q[1:]*np.abs(Q[1:])       # C- from node i+1
        Hn = np.empty(N+1); Qn = np.empty(N+1)
        Hn[1:N] = (cp[:-1] + cm[1:])/2; Qn[1:N] = (cp[:-1] - cm[1:])/(2*B)
        Hn[0] = p['Hres']; Qn[0] = (p['Hres'] - cm[0])/B
        c = (tau(n*dt, p['Tc'], p['law'])*k)**2; cpN = cp[-1]; d = B*B*c*c + 4*c*cpN
        Qn[N] = (-B*c + np.sqrt(d))/2 if (c > 0 and cpN > 0 and d > 0) else 0.0
        Hn[N] = cpN - B*Qn[N]; H, Q = Hn, Qn; Hf[n] = H; Qv[n] = Q[N]
    return dict(a=a, dt=dt, t=np.arange(steps+1)*dt, H=Hf, Qv=Qv, p=p, Q0=Q0)

def run_tests():
    r = simulate(dict(law='none', T=5)); assert np.abs(r['H'] - r['H'][0]).max() < 1e-9; print('PASS steady state preserved')
    p = dict(f=0., Tc=1e-9, V0=1.0); r = simulate(p); a, L = r['a'], 1000.; dH = a/g
    Hv = r['H'][:, -1]; t = r['t']; at = lambda tt: Hv[np.argmin(abs(t-tt))]
    assert abs(Hv.max() - (100+dH)) < 1e-9*dH
    assert abs(at(L/a) - (100+dH)) < 1e-6 and abs(at(3*L/a) - (100-dH)) < 1e-6 and abs(at(5*L/a) - (100+dH)) < 1e-6
    print(f'PASS Joukowsky: a={a:.1f} m/s, dH={dH:.2f} m, square wave period 4L/a={4*L/a:.4f} s')
    Tc = 5*2*L/a; r = simulate(dict(f=0., Tc=Tc, V0=1.0)); pk = r['H'][:, -1].max()-100; mich = 2*L/(g*Tc)
    assert pk < dH and 0.5*mich < pk < 1.5*mich; print(f'PASS slow closure: MOC rise {pk:.2f} m vs Michaud {mich:.2f} m (Joukowsky {dH:.1f} m)')
    pk = [simulate(dict(Tc=2.0, N=n))['H'][:, -1].max() for n in (50, 100, 200)]
    assert abs(pk[0]-pk[2])/pk[2] < 0.02 and abs(pk[1]-pk[2])/pk[2] < 0.01; print('PASS convergence N=50/100/200 peaks:', np.round(pk, 3))
    r = simulate(dict(Tc=1e-9, V0=0.5, T=30)); Hv = r['H'][:, -1]; w = len(Hv)//8
    m = [Hv[i*w:(i+1)*w].max() for i in range(8)]; assert m[0] > m[3] > m[7]; print('PASS friction decay', np.round(m[::3], 2))
    r = simulate(dict(Tc=2.0, T=8, N=60))
    json.dump(dict(p=r['p'], Hv=r['H'][:, -1].tolist(), Hm=r['H'][:, 30].tolist(), a=r['a']), open('ref_case.json', 'w'))

if __name__ == '__main__': run_tests(); print('ALL PYTHON TESTS PASSED')
