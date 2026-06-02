export interface UserProfile {
  name: string;
  currentRole: string;
  experience: string;
  skills: string;
  domain: string;
  targetRoles: string;
  location: string;
}

export function buildProfileString(profile: UserProfile): string {
  const parts: string[] = [];
  if (profile.name) parts.push(profile.name);
  if (profile.currentRole) parts.push(profile.currentRole);
  if (profile.experience) parts.push(`${profile.experience} of experience`);
  if (profile.skills) parts.push(`Skills: ${profile.skills}`);
  if (profile.domain) parts.push(`Domain expertise: ${profile.domain}`);
  if (profile.targetRoles) parts.push(`Target roles: ${profile.targetRoles}`);
  if (profile.location) parts.push(`Location: ${profile.location}`);
  return parts.join(". ") + ".";
}
