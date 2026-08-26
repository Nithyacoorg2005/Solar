import { useState } from 'react';
import { Sun, Loader2, AlertCircle, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/authContext';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (mode === 'signup') {
      const { error } = await signUp(email, password);
      if (error) {
        setError(error);
      } else {
        setInfo('Account created. You are now signed in.');
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Left: Hero / Project description */}
      <div className="lg:w-1/2 bg-ink-950 text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 animate-fade-in">
          <div className="w-9 h-9 bg-white/10 backdrop-blur rounded-lg flex items-center justify-center border border-white/10">
            <Sun size={18} className="text-amber-400" />
          </div>
          <span className="text-sm font-semibold tracking-tight">SolarGuard</span>
        </div>

        {/* Main content */}
        <div className="relative z-10 max-w-md py-16 lg:py-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-amber-400 bg-amber-400/10 rounded-full border border-amber-400/20 mb-6 animate-fade-in-up">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            AI-Powered Solar Monitoring
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1] text-balance animate-fade-in-up">
            Detect solar panel faults before they cost you.
          </h1>

          <p className="mt-5 text-base text-ink-400 leading-relaxed animate-fade-in-delay">
            SolarGuard uses computer vision to automatically inspect your solar panels.
            A trained deep learning model analyzes each image to identify cracks, hotspots,
            dust accumulation, and broken cells — so you can fix problems early and keep
            your panels running at peak efficiency.
          </p>

          <div className="mt-8 space-y-3 animate-fade-in-delay">
            {[
              'Automated inspections on a configurable schedule',
              'Real-time dashboard with confidence scores',
              'Instant phone notifications when faults are detected',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-ink-300">
                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-ink-500 animate-fade-in-delay">
          Final Year Project · AI-Based Fault Detection System for Solar Panels
        </div>
      </div>

      {/* Right: Auth form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 sm:p-12 lg:p-16 bg-ink-50">
        <div className="w-full max-w-sm">
          <div className="mb-8 animate-fade-in-up">
            <h2 className="text-2xl font-semibold text-ink-900 tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-2 text-sm text-ink-500">
              {mode === 'login'
                ? 'Sign in to access your solar monitoring dashboard.'
                : 'Start monitoring your solar panels in minutes.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-xl animate-scale-in">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-sm text-green-700 rounded-xl animate-scale-in">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-delay">
            <div>
              <label className="text-xs font-medium text-ink-600 block mb-2">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-600 block mb-2">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-ink-900 focus:ring-1 focus:ring-ink-900 transition-colors"
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-ink-900 rounded-xl hover:bg-ink-800 disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center animate-fade-in-delay">
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
                setInfo(null);
              }}
              className="text-sm text-ink-500 hover:text-ink-900 transition-colors"
            >
              {mode === 'login'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <span className="font-medium text-ink-900 underline underline-offset-2">
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
