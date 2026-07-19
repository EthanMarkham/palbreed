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

  const signIn = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) return;
    setForm({ busy: true });
    const { supabaseClient } = await import("../../services/supabase/supabaseClient");
    const { error } = await supabaseClient!.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    setForm(error
      ? { busy: false, error: error.message }
      : { busy: false, message: "Check your email for a sign-in link." });
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
