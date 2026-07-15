"use client";
import dayjs from "dayjs";
import BonusPaper from "@/components/bonus/bonus-paper";
import PaperModal, { usePaperSettings } from "@/components/paper/paper-modal";
import { paperSlug } from "@/components/paper/paper";
import type { Bonus } from "@/lib/types";

// Preview + download of the bonus paper (thin wrapper over the shared PaperModal).
export default function BonusPaperModal({ bonus, onClose }: { bonus: Bonus | null; onClose: () => void }) {
  const settings = usePaperSettings(!!bonus);

  return (
    <PaperModal
      open={!!bonus}
      onClose={onClose}
      title="Bonus paper"
      filename={bonus ? `bonus-${paperSlug(bonus.client_name)}-${dayjs(bonus.period_to).format("YYYYMMDD")}.jpg` : "bonus.jpg"}
    >
      {bonus && <BonusPaper bonus={bonus} settings={settings} />}
    </PaperModal>
  );
}
