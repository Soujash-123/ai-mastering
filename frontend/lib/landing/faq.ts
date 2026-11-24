// FAQ shown on / and emitted as FAQPage JSON-LD. Plain-text answers only, so
// the same strings work in the HTML and in structured data.
//
// Facts come from the backend:
// - formats: README "Architecture" + backend/mastering/style_profiles.py (_LOSSY_*)
// - loudness: backend/exports/pcm_export.py (_write_variants), analysis/pipeline.py
// - retention: backend/services/job_store.py (schedule_delete, EPHEMERAL_IDLE_SECS=600)
//   and backend/utils/config.py (appwrite_ttl_hours=12)

export type Faq = { q: string; a: string };

export const FAQS: Faq[] = [
  {
    q: "Which audio files can I upload?",
    a: "WAV, FLAC and AIFF give the best results. You can also upload phone and messaging formats: M4A, AAC, MP3, OGG and Opus. Kord converts every file to 24-bit audio before it starts work.",
  },
  {
    q: "Can I master a song I recorded on my phone?",
    a: "Yes. Phone recordings are usually compressed files, and compressed files already have small artefacts in the very top of the sound. Kord notices this and holds back on brightening the highs, so those artefacts are not made louder.",
  },
  {
    q: "How loud will my master be on Spotify, Apple Music and JioSaavn?",
    // TODO(soujash): confirm the JioSaavn guidance before launch.
    a: "Your main master follows the loudness window of the style you choose, for example −10 to −8 LUFS for dance or −16 to −14 LUFS for classical. Kord also gives you versions levelled for each platform: −14 LUFS for Spotify and −16 LUFS for Apple Music, with peaks kept under −1 dBTP. Kord does not have a separate JioSaavn version yet; if your distributor sends one file to every store, use the Spotify version unless they ask for something else.",
  },
  {
    q: "What files do I get back?",
    a: "A lossless master, plus a Spotify version (FLAC, −14 LUFS), an Apple Music version (WAV, −16 LUFS), a club version and a broadcast version (WAV, −24 LUFS).",
  },
  {
    q: "How are the Indian styles different from each other?",
    a: "Each style has its own loudness window and limits on compression. Hindustani and Carnatic stays quiet and dynamic so the tanpura never pumps. Devotional keeps the room and harmonium warm. Film and playback songs put the vocal in front and calm harsh high notes. Bollywood, Punjabi and dance is loud with a punchy dhol and a tight, mono low end. Fusion and indie keeps acoustic instruments real inside a modern mix.",
  },
  {
    q: "Does the AI change my audio directly?",
    a: "No. The AI reads measurements of your track, never the audio itself, and describes what the master needs. Fixed rules then turn that into actual settings and keep every setting inside the limits of your chosen style. The AI cannot go past those limits.",
  },
  {
    q: "How long do you keep my files?",
    // TODO(soujash): confirm this matches the privacy policy wording.
    a: "Your upload and the working files are deleted about 10 minutes after you stop working on the track. The finished master is kept in cloud storage for up to 12 hours so you can download it, and is then deleted automatically. Download your files once they are ready.",
  },
  {
    q: "How does early access work?",
    a: "Fill in the short request form. We read every request ourselves and get in touch personally to set up your account, so we can make sure Kord works well for your music before opening it up to everyone.",
  },
  {
    q: "Who makes Kord?",
    a: "Kord is built by Syntalix LLP.",
  },
];
