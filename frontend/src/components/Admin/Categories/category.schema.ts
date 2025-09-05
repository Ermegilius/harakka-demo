import z from "zod";

export const initialData = {
  id: crypto.randomUUID() as string,
  translations: {
    fi: "",
    en: "",
  },
  parent_id: null,
};

export const createCategoryDto = z.object({
  id: z.string().uuid(),
  translations: z.object({
    en: z.string().min(1),
    fi: z.string().min(1),
  }),
  parent_id: z.string().uuid().nullable().optional(),
});
