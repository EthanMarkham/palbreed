import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  TextField,
} from "react-aria-components";
import type { User } from "@supabase/supabase-js";
import StatusBanner from "../../components/StatusBanner";
import { runtimeConfig } from "../../config/runtimeConfig";

type FormState = {
  busy: boolean;
  message?: string;
  error?: string;
};

export default function SyncSignIn() {
  const [user, setUser] = useState<User>();
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<FormState>({ busy: false });

  useEffect(() => {
    if (!runtimeConfig.supabase) return;
    let active = true;
    let unsubscribe = () => {};
    void import("../../services/supabase/supabaseClient").then(({ supabaseClient }) => {
      if (!active || !supabaseClient) return;
      void supabaseClient.auth.getUser().then(({ data }) => {
        if (active) setUser(data.user ?? undefined);
      });
      const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (active) setUser(session?.user);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!runtimeConfig.supabase) return null;
  const googleSignInEnabled = runtimeConfig.supabase.signInMethod === "google";

  const redirectTo = () => {
    const url = new URL(window.location.href);
    url.hash = "";
    return url.href;
  };

  const signInWithGoogle = async () => {
    setForm({ busy: true });
    try {
      const { supabaseClient } = await import("../../services/supabase/supabaseClient");
      const { error } = await supabaseClient!.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo() },
      });
      if (error) setForm({ busy: false, error: error.message });
    } catch (error) {
      setForm({
        busy: false,
        error: error instanceof Error ? error.message : "Google sign-in could not be started.",
      });
    }
  };

  const signIn = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) return;
    setForm({ busy: true });
    try {
      const { supabaseClient } = await import("../../services/supabase/supabaseClient");
      const { error } = await supabaseClient!.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: redirectTo() },
      });
      setForm(error
        ? { busy: false, error: error.message }
        : { busy: false, message: "Check your email for a sign-in link." });
    } catch (error) {
      setForm({
        busy: false,
        error: error instanceof Error ? error.message : "Email sign-in could not be started.",
      });
    }
  };

  const signOut = async () => {
    setForm({ busy: true });
    const { supabaseClient } = await import("../../services/supabase/supabaseClient");
    const { error } = await supabaseClient!.auth.signOut();
    setForm(error ? { busy: false, error: error.message } : { busy: false });
  };

  return (
    <DialogTrigger>
      <Button className="sync-sign-in-trigger">{user ? "Sync on" : "Sign in"}</Button>
      <ModalOverlay className="sync-sign-in-overlay" isDismissable>
        <Modal className="sync-sign-in-modal">
          <Dialog className="sync-sign-in-dialog">
            {({ close }) => (
              <>
                <Button className="sync-sign-in-close" aria-label="Close" onPress={close}>×</Button>
                <span className="section-kicker">PALPATH</span>
                <Heading slot="title">{user ? "Your data is syncing" : "Sign in to sync data across devices"}</Heading>
                {user ? (
                  <>
                    <p>{user.email}</p>
                    <Button className="secondary-button" isDisabled={form.busy} onPress={() => void signOut()}>
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    {googleSignInEnabled ? (
                      <>
                        <Button
                          className="google-sign-in-button"
                          isDisabled={form.busy}
                          onPress={() => void signInWithGoogle()}
                        >
                          <GoogleIcon />
                          <span>Continue with Google</span>
                        </Button>
                        <div className="sync-sign-in-divider" aria-hidden="true">
                          <span>or continue with email</span>
                        </div>
                      </>
                    ) : null}
                    <TextField className="sync-sign-in-field" value={email} onChange={setEmail}>
                      <Label>Email</Label>
                      <Input type="email" autoComplete="email" placeholder="you@example.com" />
                    </TextField>
                    <Button
                      className="primary-button"
                      isDisabled={form.busy || !email.trim()}
                      onPress={() => void signIn()}
                    >
                      Continue
                    </Button>
                  </>
                )}
                {form.message ? <StatusBanner kind="working" message={form.message} /> : null}
                {form.error ? <StatusBanner kind="error" message={form.error} /> : null}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

function GoogleIcon() {
  return (
    <svg className="google-sign-in-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.614Z" />
      <path fill="#4285F4" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.836.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z" />
      <path fill="#34A853" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
    </svg>
  );
}
