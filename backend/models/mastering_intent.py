"""Pydantic models: perceptual intensities on a 0–10 mastering scale; real units for LUFS/dB/ms/ratio."""

from pydantic import BaseModel, Field


class MasteringChain(BaseModel):
    mastering_style: str = ""
    processing_intensity: float = Field(default=5.0, ge=0.0, le=10.0)
    analog_character_amount: float = Field(default=5.0, ge=0.0, le=10.0)
    # Program loudness intent (LUFS). Authoritative loudness for DSP is loudness_strategy.target_lufs; keep these aligned in practice.
    target_lufs: float = Field(default=-10.0, ge=-18.0, le=-7.0)
    overall_emotional_goal: str = ""
    translation_priority: str = ""


class EqStrategy(BaseModel):
    sub_control_db: float = Field(default=0.0, ge=-6.0, le=6.0)
    bass_weight_db: float = Field(default=0.0, ge=-6.0, le=6.0)
    low_mid_cleanup_db: float = Field(default=0.0, ge=-6.0, le=6.0)
    midrange_presence_db: float = Field(default=0.0, ge=-6.0, le=6.0)
    upper_mid_control_db: float = Field(default=0.0, ge=-6.0, le=6.0)
    air_enhancement_db: float = Field(default=0.0, ge=-6.0, le=6.0)
    brightness_intensity: float = Field(default=5.0, ge=0.0, le=10.0)
    warmth_intensity: float = Field(default=5.0, ge=0.0, le=10.0)
    clarity_intensity: float = Field(default=5.0, ge=0.0, le=10.0)
    spectral_balance_strategy: str = ""


class CompressionStrategy(BaseModel):
    compression_style: str = ""
    compression_intensity: float = Field(default=4.0, ge=0.0, le=10.0)
    glue_amount: float = Field(default=4.0, ge=0.0, le=10.0)
    punch_preservation: float = Field(default=6.0, ge=0.0, le=10.0)
    microdynamic_retention: float = Field(default=6.0, ge=0.0, le=10.0)
    attack_behavior_ms: float = Field(default=20.0, ge=1.0, le=120.0)
    release_behavior_ms: float = Field(default=120.0, ge=20.0, le=600.0)
    ratio: float = Field(default=1.6, ge=1.0, le=4.0)
    dynamic_density: float = Field(default=5.0, ge=0.0, le=10.0)
    compression_notes: str = ""


class SaturationStrategy(BaseModel):
    saturation_style: str = ""
    saturation_amount: float = Field(default=3.0, ge=0.0, le=10.0)
    tube_character: float = Field(default=3.0, ge=0.0, le=10.0)
    tape_character: float = Field(default=3.0, ge=0.0, le=10.0)
    transformer_weight: float = Field(default=2.0, ge=0.0, le=10.0)
    harmonic_density: float = Field(default=4.0, ge=0.0, le=10.0)
    transient_softening: float = Field(default=2.0, ge=0.0, le=10.0)
    high_end_texture: str = ""
    coloration_notes: str = ""


class SpatialStrategy(BaseModel):
    stereo_width_amount: float = Field(default=5.0, ge=0.0, le=10.0)
    center_image_strength: float = Field(default=7.0, ge=0.0, le=10.0)
    front_back_depth: float = Field(default=5.0, ge=0.0, le=10.0)
    side_energy_amount: float = Field(default=5.0, ge=0.0, le=10.0)
    mono_compatibility_priority: float = Field(default=7.0, ge=0.0, le=10.0)
    low_end_width_reduction: float = Field(default=5.0, ge=0.0, le=10.0)
    spatial_realism: float = Field(default=6.0, ge=0.0, le=10.0)
    depth_strategy: str = ""


class TransientStrategy(BaseModel):
    transient_emphasis: float = Field(default=5.0, ge=0.0, le=10.0)
    attack_enhancement: float = Field(default=5.0, ge=0.0, le=10.0)
    impact_preservation: float = Field(default=6.0, ge=0.0, le=10.0)
    drum_punch_priority: float = Field(default=6.0, ge=0.0, le=10.0)
    transient_smoothing: float = Field(default=3.0, ge=0.0, le=10.0)
    transient_notes: str = ""


class VocalStrategy(BaseModel):
    vocal_presence_amount: float = Field(default=5.0, ge=0.0, le=10.0)
    vocal_forwardness: float = Field(default=5.0, ge=0.0, le=10.0)
    vocal_warmth: float = Field(default=5.0, ge=0.0, le=10.0)
    vocal_air: float = Field(default=4.0, ge=0.0, le=10.0)
    sibilance_control: float = Field(default=5.0, ge=0.0, le=10.0)
    vocal_emotional_focus: float = Field(default=6.0, ge=0.0, le=10.0)
    vocal_notes: str = ""


class LoudnessStrategy(BaseModel):
    target_lufs: float = Field(default=-10.0, ge=-18.0, le=-7.0)
    true_peak_target_db: float = Field(default=-1.0, ge=-3.0, le=-0.2)
    limiter_aggressiveness: float = Field(default=4.0, ge=0.0, le=10.0)
    perceived_loudness_priority: float = Field(default=5.0, ge=0.0, le=10.0)
    dynamic_preservation_priority: float = Field(default=6.0, ge=0.0, le=10.0)
    streaming_optimization_strength: float = Field(default=6.0, ge=0.0, le=10.0)
    loudness_notes: str = ""


class TranslationStrategy(BaseModel):
    earbud_translation_priority: float = Field(default=6.0, ge=0.0, le=10.0)
    club_translation_priority: float = Field(default=4.0, ge=0.0, le=10.0)
    car_translation_priority: float = Field(default=6.0, ge=0.0, le=10.0)
    bluetooth_translation_priority: float = Field(default=6.0, ge=0.0, le=10.0)
    cinema_translation_priority: float = Field(default=3.0, ge=0.0, le=10.0)
    mono_translation_priority: float = Field(default=7.0, ge=0.0, le=10.0)
    codec_resilience_priority: float = Field(default=7.0, ge=0.0, le=10.0)
    translation_notes: str = ""


class SectionalProcessingItem(BaseModel):
    section: str = ""
    start_sec: float = 0.0
    end_sec: float = 0.0
    energy_level: float = Field(default=5.0, ge=0.0, le=10.0)
    processing_intensity: float = Field(default=5.0, ge=0.0, le=10.0)
    stereo_expansion: float = Field(default=5.0, ge=0.0, le=10.0)
    compression_amount: float = Field(default=5.0, ge=0.0, le=10.0)
    harmonic_density: float = Field(default=5.0, ge=0.0, le=10.0)
    transient_preservation: float = Field(default=5.0, ge=0.0, le=10.0)
    emotional_goal: str = ""
    section_notes: str = ""


class RiskManagement(BaseModel):
    detected_risks: list[str] = Field(default_factory=list)
    fatigue_risk: float = Field(default=5.0, ge=0.0, le=10.0)
    harshness_risk: float = Field(default=5.0, ge=0.0, le=10.0)
    low_end_masking_risk: float = Field(default=5.0, ge=0.0, le=10.0)
    stereo_instability_risk: float = Field(default=5.0, ge=0.0, le=10.0)
    codec_failure_risk: float = Field(default=5.0, ge=0.0, le=10.0)
    protection_strategy: str = ""


class FinalReport(BaseModel):
    mix_assessment: str = ""
    mastering_direction: str = ""
    commercial_readiness: str = ""
    translation_assessment: str = ""
    dynamic_assessment: str = ""
    spatial_assessment: str = ""
    emotional_assessment: str = ""
    final_summary: str = ""


class MasteringIntent(BaseModel):
    mastering_chain: MasteringChain
    eq_strategy: EqStrategy
    compression_strategy: CompressionStrategy
    saturation_strategy: SaturationStrategy
    spatial_strategy: SpatialStrategy
    transient_strategy: TransientStrategy
    vocal_strategy: VocalStrategy
    loudness_strategy: LoudnessStrategy
    translation_strategy: TranslationStrategy
    sectional_processing: list[SectionalProcessingItem] = Field(default_factory=list)
    risk_management: RiskManagement
    final_report: FinalReport


MasteringReport = FinalReport
