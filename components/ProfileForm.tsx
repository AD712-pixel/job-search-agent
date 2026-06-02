"use client";

import { useState } from "react";
import type { UserProfile } from "@/lib/candidate-profile";

interface Props {
  initial?: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onCancel?: () => void;
  isOnboarding?: boolean;
}

const EMPTY: UserProfile = {
  name: "",
  currentRole: "",
  experience: "",
  skills: "",
  domain: "",
  targetRoles: "",
  location: "",
};

export default function ProfileForm({ initial, onSave, onCancel, isOnboarding }: Props) {
  const [form, setForm] = useState<UserProfile>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof UserProfile, string>>>({});

  const set = (field: keyof UserProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof UserProfile, string>> = {};
    if (!form.name.trim()) next.name = "Required";
    if (!form.currentRole.trim()) next.currentRole = "Required";
    if (!form.experience.trim()) next.experience = "Required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-lg">
      <Field
        label="Full name"
        required
        value={form.name}
        onChange={set("name")}
        placeholder="Jane Smith"
        error={errors.name}
      />
      <Field
        label="Current role & company"
        required
        value={form.currentRole}
        onChange={set("currentRole")}
        placeholder="Senior Product Manager at Acme Corp"
        error={errors.currentRole}
      />
      <Field
        label="Years of experience"
        required
        value={form.experience}
        onChange={set("experience")}
        placeholder="6 years"
        error={errors.experience}
      />
      <Field
        label="Skills"
        value={form.skills}
        onChange={set("skills")}
        placeholder="Product Management, GTM Strategy, Pre-Sales, Solution Storytelling"
        hint="Comma separated"
      />
      <Field
        label="Domain expertise"
        value={form.domain}
        onChange={set("domain")}
        placeholder="Fintech, Enterprise SaaS, B2B, AI Agents"
        hint="Comma separated"
      />
      <Field
        label="Target roles"
        value={form.targetRoles}
        onChange={set("targetRoles")}
        placeholder="Product Manager, GTM Manager, Pre-Sales Lead, Partnerships Manager"
        hint="Comma separated"
      />
      <Field
        label="Location & preferences"
        value={form.location}
        onChange={set("location")}
        placeholder="Bengaluru, open to relocate India/abroad"
      />

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isOnboarding ? "Save and continue" : "Save profile"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors border border-slate-700"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  error?: string;
}

function Field({ label, value, onChange, placeholder, hint, required, error }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-400">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="text-slate-600 font-normal ml-1">— {hint}</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors ${
          error ? "border-red-500 focus:border-red-400" : "border-slate-700 focus:border-slate-500"
        }`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
