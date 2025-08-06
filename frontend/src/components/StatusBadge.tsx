import { Badge } from "../components/ui/badge";
import { t } from "@/translations";
import { useLanguage } from "@/context/LanguageContext";

interface StatusBadgeProps {
  status?: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const { lang } = useLanguage();

  if (!status) {
    return (
      <Badge variant="outline">{t.statusBadge.status.unknown[lang]}</Badge>
    );
  }

  switch (status) {
    case "pending":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-100 text-yellow-800 border-yellow-300"
        >
          {t.statusBadge.status.pending[lang]}
        </Badge>
      );
    case "confirmed":
      return (
        <Badge
          variant="outline"
          className="bg-green-100 text-green-800 border-green-300"
        >
          {t.statusBadge.status.confirmed[lang]}
        </Badge>
      );
    case "cancelled":
      return (
        <Badge
          variant="outline"
          className="bg-red-100 text-red-800 border-red-300"
        >
          {t.statusBadge.status.cancelled[lang]}
        </Badge>
      );
    case "cancelled by user":
      return (
        <Badge
          variant="outline"
          className="bg-red-100 text-red-800 border-red-300"
        >
          {t.statusBadge.status.cancelledByUser[lang]}
        </Badge>
      );
    case "cancelled by admin":
      return (
        <Badge
          variant="outline"
          className="bg-red-100 text-red-800 border-red-300"
        >
          {t.statusBadge.status.cancelledByAdmin[lang]}
        </Badge>
      );
    case "rejected":
      return (
        <Badge
          variant="outline"
          className="bg-red-100 text-red-800 border-red-300"
        >
          {t.statusBadge.status.rejected[lang]}
        </Badge>
      );
    case "completed":
      return (
        <Badge
          variant="outline"
          className="bg-blue-100 text-blue-800 border-blue-300"
        >
          {t.statusBadge.status.completed[lang]}
        </Badge>
      );
    case "picked up":
      return (
        <Badge
          variant="outline"
          className="bg-green-100 text-green-800 border-green-300"
        >
          {t.statusBadge.status.pickedUp[lang]}
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};
