import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "uk.nhs.skillslab",
  appName: "SkillsLab",
  webDir: "dist",
  ios: {
    scheme: "SkillsLab",
    contentInset: "automatic",
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false,
    },
  },
};

export default config;
