"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import s from "@/components/auth/auth.module.css";

export default function SignupPage() {
  return (
    <AuthFrame
      title="Kord is invite-only for now"
      line="We onboard every artist ourselves during early access, so Kord works well for your music from the first upload."
    >
      <h1 className={s.h2}>Sign up by requesting access</h1>
      <p className={s.sub}>Tell us a little about your music. We read every request and get in touch personally.</p>

      <ul className={s.list}>
        <li>
          <strong>Five Indian styles</strong>, from Hindustani and Carnatic to Bollywood dance
        </li>
        <li>
          <strong>Phone recordings welcome</strong>: M4A, AAC, MP3, OGG and Opus as well as WAV, FLAC and AIFF
        </li>
        <li>
          <strong>Release-ready files</strong> for Spotify, Apple Music, club and broadcast
        </li>
      </ul>

      <div className={s.form}>
        <Link href="/access-request" className={s.btn}>
          Request early access
        </Link>
      </div>

      <p className={s.foot}>
        Already have an account?{" "}
        <Link href="/login" className={s.link}>
          Log in
        </Link>
      </p>
    </AuthFrame>
  );
}
