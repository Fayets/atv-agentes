import { useState } from "react";
import { User, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShineBorder } from "@/components/magicui/shine-border";
import { ShimmerButton } from "@/components/magicui/shimmer-button";

/**
 * Sign In Form — Ruixen UI (21st.dev/@ruixen.ui)
 */
export default function SignInForm({ onSubmit, error, submitting }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="relative w-full text-left overflow-hidden rounded-2xl border border-white/10 bg-card p-6 sm:p-7">
      <ShineBorder shineColor={["#e11d2e", "#ff6b76", "#9b0f1c"]} duration={12} />
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.({ username, password });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="username" className="text-white/70">
            Usuario
          </Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <Input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="pl-10"
              placeholder="juan"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password" className="text-white/70">
            Contraseña
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10"
              placeholder="••••••••"
            />
          </div>
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <ShimmerButton
          type="submit"
          disabled={submitting}
          className="mt-1 w-full disabled:opacity-60"
        >
          {submitting ? "Entrando…" : "Entrar al panel"}
        </ShimmerButton>
      </form>
    </div>
  );
}
