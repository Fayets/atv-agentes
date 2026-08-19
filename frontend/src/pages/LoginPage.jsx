import { Navigate, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import SignInForm from "@/components/ui/sign-in-form";

export default function LoginPage() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const dest =
      user.role === "client_admin" && user.client_id
        ? `/dashboard/${user.client_id}`
        : "/dashboard/c1";
    return <Navigate to={dest} replace />;
  }

  async function handleSubmit({ email, password }) {
    setError("");
    setSubmitting(true);
    try {
      await api.login({ email, password });
      const me = await api.getMe();
      setUser(me);
      navigate(`/dashboard/${me.client_id || "c1"}`);
    } catch {
      setError("Email o contraseña incorrectos.");
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <DotPattern className="fill-white/8 [mask-image:radial-gradient(ellipse_at_center,white,transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(225,29,46,0.18),transparent_68%)]" />

      <header className="relative z-10 flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <img
            src="/atv-logo.png"
            alt="ATV"
            width={28}
            height={28}
            className="size-7 object-contain [filter:hue-rotate(-28deg)_saturate(1.25)_brightness(0.95)]"
          />
          <span className="text-sm font-semibold tracking-wide text-primary">
            Grounded ATV
          </span>
        </div>
        <AnimatedShinyText className="hidden text-[11px] uppercase tracking-[0.16em] sm:inline">
          Acceso anticipado · conocimiento con IA
        </AnimatedShinyText>
      </header>

      <main className="login-page__main relative z-10">
        <div className="login-page__stack">
          <p className="mb-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/50">
            Vista cliente
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Tu conocimiento,
            <br />
            un <span className="text-primary">árbol vivo.</span>
          </h1>
          <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">
            Entrá al mapa de agentes, cargá documentos y dejá que Grounded trabaje sobre la base del cliente.
          </p>
          <SignInForm onSubmit={handleSubmit} error={error} submitting={submitting} />
        </div>
      </main>
    </div>
  );
}
