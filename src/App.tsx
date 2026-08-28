import { useEffect, useRef, useState } from 'react';
import { Sun, LayoutDashboard, Camera, History, Settings, Menu, X, LogOut, Info } from 'lucide-react';
import { Dashboard } from '@/components/Dashboard';
import { CameraCapture } from '@/components/CameraCapture';
import { InspectionHistory } from '@/components/InspectionHistory';
import { InspectionDetails } from '@/components/InspectionDetails';
import { ScheduleSettings } from '@/components/ScheduleSettings';
import { NotificationStatus } from '@/components/NotificationStatus';
import { AuthPage } from '@/components/AuthPage';
import { useAuth } from '@/lib/authContext';
import { isModelConnected } from '@/lib/modelAdapter';
import { getSchedule, runInspection } from '@/lib/inspectionApi';
import { captureFromWifiCamera } from '@/lib/cameraStream';

type View = 'dashboard' | 'capture' | 'history' | 'details' | 'schedule' | 'about';

const DEFAULT_PANEL_ID = 'Panel-A1';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [panelId] = useState(DEFAULT_PANEL_ID);
  const scheduledInspectionRunning = useRef(false);
  const lastScheduledRun = useRef<string | null>(null);

  const modelConnected = isModelConnected();
  const handleInspectionComplete = () => {
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function checkSchedule() {
      if (cancelled || scheduledInspectionRunning.current) return;

      try {
        const schedule = await getSchedule(panelId);
        if (!schedule?.is_active || schedule.days_of_week.length === 0) return;

        const now = new Date();
        const [scheduledHour, scheduledMinute] = schedule.inspection_time.split(':').map(Number);
        if (!Number.isInteger(scheduledHour) || !Number.isInteger(scheduledMinute)) {
          console.warn(`Scheduled inspection skipped: invalid time "${schedule.inspection_time}".`);
          return;
        }
        const runKey = `${schedule.id}-${now.toDateString()}-${schedule.inspection_time}`;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const scheduledMinutes = scheduledHour * 60 + scheduledMinute;
        const minutesSinceSchedule = currentMinutes - scheduledMinutes;
        const isDue = schedule.days_of_week.includes(now.getDay())
          && minutesSinceSchedule >= 0
          && minutesSinceSchedule < 24 * 60;

        if (!isDue || lastScheduledRun.current === runKey) return;
        const wifiCameraConfigured = Boolean(
          import.meta.env.VITE_CAMERA_STREAM_URL && import.meta.env.VITE_CAMERA_STREAM_TOKEN,
        );
        if (!wifiCameraConfigured && !navigator.mediaDevices?.getUserMedia) {
          console.warn('Scheduled inspection skipped: camera access is not supported by this browser.');
          return;
        }

        scheduledInspectionRunning.current = true;
        const imageBlob = await captureScheduledImage(schedule.camera_device);
        if (cancelled) return;

        lastScheduledRun.current = runKey;
        await runInspection(schedule.panel_id, imageBlob, 'scheduled');
        if (!cancelled) setRefreshKey((key) => key + 1);
      } catch (err) {
        console.error('Scheduled inspection failed:', err);
      } finally {
        scheduledInspectionRunning.current = false;
      }
    }

    checkSchedule();
    const timer = window.setInterval(checkSchedule, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [panelId, user]);

  const handleSelectInspection = (id: string) => {
    setSelectedInspectionId(id);
    setView('details');
    setMobileNavOpen(false);
  };

  const navigate = (v: View) => {
    setView(v);
    setMobileNavOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center">
        <Sun size={24} className="text-ink-300 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const navItems = [
    { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'capture' as View, label: 'New Inspection', icon: Camera },
    { id: 'history' as View, label: 'History', icon: History },
    { id: 'schedule' as View, label: 'Schedule', icon: Settings },
    { id: 'about' as View, label: 'About', icon: Info },
  ];

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-ink-200/60 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button onClick={() => navigate('dashboard')} className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 bg-ink-900 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105">
                <Sun size={18} className="text-amber-400" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold tracking-tight leading-none">SolarGuard</h1>
                <p className="text-[11px] text-ink-400 leading-none mt-0.5">Fault Detection System</p>
              </div>
            </button>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id || (item.id === 'history' && view === 'details');
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all ${
                      active
                        ? 'bg-ink-900 text-white'
                        : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100'
                    }`}
                  >
                    <Icon size={15} />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 text-xs text-ink-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>{user.email}</span>
              </div>
              <button
                onClick={signOut}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ink-400 hover:text-ink-900 rounded-lg transition-colors"
              >
                <LogOut size={15} />
                <span className="hidden lg:inline">Sign Out</span>
              </button>

              {/* Mobile menu button */}
              <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="md:hidden p-2 text-ink-600">
                {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Mobile Nav */}
          {mobileNavOpen && (
            <nav className="md:hidden pb-3 space-y-1 animate-fade-in">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id || (item.id === 'history' && view === 'details');
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-ink-400 hover:bg-ink-100 rounded-lg"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* Model status bar */}
      {!modelConnected && view !== 'about' && (
        <div className="bg-amber-50/80 backdrop-blur border-b border-amber-200/60 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center gap-2 text-xs text-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>
              AI model not connected. Set <code className="px-1.5 py-0.5 bg-amber-100 rounded font-mono">VITE_MODEL_INFERENCE_URL</code> to enable predictions.
            </span>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div key={view} className="animate-fade-in">
          {view === 'dashboard' && (
            <div className="space-y-8">
              <PageHeader
                title="Dashboard"
                subtitle="Real-time overview of your solar panel monitoring system."
              />
              <NotificationStatus />
              <Dashboard panelId={panelId} onSelectInspection={handleSelectInspection} refreshKey={refreshKey} />
            </div>
          )}

          {view === 'capture' && (
            <div className="space-y-8">
              <PageHeader
                title="New Inspection"
                subtitle="Capture an image of the solar panel using the laptop camera, or upload an image file."
              />
              <CameraCapture panelId={panelId} onInspectionComplete={handleInspectionComplete} />
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-8">
              <PageHeader
                title="Inspection History"
                subtitle="Complete record of all past inspections with AI predictions and fault analysis."
              />
              <InspectionHistory panelId={panelId} onSelectInspection={handleSelectInspection} refreshKey={refreshKey} />
            </div>
          )}

          {view === 'details' && selectedInspectionId && (
            <InspectionDetails inspectionId={selectedInspectionId} onBack={() => setView('history')} />
          )}

          {view === 'schedule' && (
            <div className="space-y-8">
              <PageHeader
                title="Inspection Schedule"
                subtitle="Configure when automatic inspections run and which camera to use."
              />
              <ScheduleSettings panelId={panelId} />
              <NotificationStatus />
            </div>
          )}

          {view === 'about' && <AboutPage />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-ink-200/60 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <Sun size={12} className="text-amber-400" />
              <span>SolarGuard — AI-Based Fault Detection System for Solar Panels</span>
            </div>
            <p className="text-xs text-ink-400">Final Year Project</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

async function captureScheduledImage(cameraDevice: string): Promise<Blob> {
  if (import.meta.env.VITE_CAMERA_STREAM_URL && import.meta.env.VITE_CAMERA_STREAM_TOKEN) {
    return captureFromWifiCamera();
  }

  const requestedDevice = cameraDevice.trim().toLowerCase();
  const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  let stream = initialStream;

  if (requestedDevice && requestedDevice !== 'phone' && requestedDevice !== 'default') {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const matchingCamera = devices.find((device) =>
      device.kind === 'videoinput' && device.label.toLowerCase().includes(requestedDevice)
    );
    if (!matchingCamera) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(`Camera "${cameraDevice}" was not found. Check the name in Windows camera settings.`);
    }
    if (matchingCamera.deviceId !== stream.getVideoTracks()[0]?.getSettings().deviceId) {
      initialStream.getTracks().forEach((track) => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: matchingCamera.deviceId } },
        audio: false,
      });
    }
  }

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out waiting for the laptop camera.')), 10_000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Unable to read the laptop camera.'));
      };
    });
    await video.play();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 300));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to capture an image from the laptop camera.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The laptop camera returned an empty image.'));
      }, 'image/jpeg', 0.85);
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="animate-fade-in-up">
      <h2 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
      <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <PageHeader
        title="About This Project"
        subtitle="Overview of the system, its purpose, and how it works."
      />

      <div className="space-y-6">
        <section className="animate-fade-in-up">
          <h3 className="text-base font-semibold text-ink-900 mb-2">Problem Statement</h3>
          <p className="text-sm leading-relaxed text-ink-600">
            Solar panels are exposed to environmental conditions that can cause physical degradation
            over time. Faults such as microcracks, hotspots, dust accumulation, and broken cells reduce
            energy output and can lead to permanent damage if left unaddressed. Manual inspection of
            solar installations is slow, costly, and difficult to perform regularly — especially for
            large-scale or rooftop deployments.
          </p>
        </section>

        <section className="animate-fade-in-up">
          <h3 className="text-base font-semibold text-ink-900 mb-2">System Overview</h3>
          <p className="text-sm leading-relaxed text-ink-600">
            This system automates the inspection process using a camera and a trained deep learning
            model. The laptop camera captures an image of the solar panel surface, which is then sent to
            the AI model for analysis. The model classifies the panel's condition and identifies
            specific fault types. Each inspection result is stored in a database with the date, time,
            image, prediction, and confidence score.
          </p>
        </section>

        <section className="animate-fade-in-up">
          <h3 className="text-base font-semibold text-ink-900 mb-3">How It Works</h3>
          <ol className="space-y-2.5">
            {[
              'The camera captures an image of the solar panel (manually or on schedule).',
              'The image is sent to the trained AI model via the inference API.',
              'The model analyzes the image and returns a prediction with a confidence score.',
              'The result is stored in the database with the inspection timestamp.',
              'The dashboard updates to show the current panel status and latest image.',
              'If a fault is detected, a notification is sent to the user\'s phone.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-ink-600">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-ink-900 text-white text-xs font-medium flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="animate-fade-in-up">
          <h3 className="text-base font-semibold text-ink-900 mb-2">Architecture</h3>
          <div className="bg-ink-950 rounded-xl p-5 font-mono text-xs text-ink-300 overflow-x-auto">
            Laptop Camera → Frontend (React) → Model Adapter → Trained ML Model → Prediction → Database → Dashboard → Notification
          </div>
        </section>

        <section className="animate-fade-in-up">
          <h3 className="text-base font-semibold text-ink-900 mb-2">Model Integration</h3>
          <p className="text-sm leading-relaxed text-ink-600">
            The system uses a model adapter — a clean interface between the application and the trained
            model. The frontend never needs to know how the model is implemented. To connect the real
            model, set the <code className="px-1.5 py-0.5 bg-ink-100 rounded text-xs font-mono">VITE_MODEL_INFERENCE_URL</code> environment
            variable to the inference service URL. The adapter handles common response formats and
            can be adjusted to match the model's exact output.
          </p>
        </section>

        <section className="animate-fade-in-up">
          <h3 className="text-base font-semibold text-ink-900 mb-3">Key Features</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              'Camera capture with live viewfinder',
              'Image upload fallback',
              'AI-powered fault detection',
              'Configurable inspection schedule',
              'Real-time dashboard with statistics',
              'Complete inspection history',
              'Phone notifications for faults',
              'Confidence scores and raw output',
              'Comprehensive error handling',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5 text-sm text-ink-600">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
