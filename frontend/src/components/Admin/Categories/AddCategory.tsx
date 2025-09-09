import { createCategoryDto, initialData } from "./category.schema";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/LanguageContext";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearSelectedCategory,
  createCategory,
  fetchAllCategories,
  selectCategories,
  selectCategoriesError,
  selectCategory,
  updateCategory,
} from "@/store/slices/categoriesSlice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { SubmitErrorHandler, useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Category } from "@common/items/categories";
import { toast } from "sonner";
import { getFirstErrorMessage } from "@/utils/validate";
import { t } from "@/translations";
import { useEffect } from "react";

function AddCategory() {
  const { lang } = useLanguage();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const categories = useAppSelector(selectCategories);
  const error = useAppSelector(selectCategoriesError);
  const selectedCategory = useAppSelector(selectCategory);

  const form = useForm<z.infer<typeof createCategoryDto>>({
    resolver: zodResolver(createCategoryDto),
    defaultValues: selectedCategory ?? initialData,
  });

  /*----------------handlers----------------------------------*/
  const cancel = () => {
    void dispatch(clearSelectedCategory());
    void navigate("/admin/categories");
  };

  useEffect(() => {
    void dispatch(fetchAllCategories({ page: 1, limit: 100 }));
  }, [dispatch]);
  const onValidSubmit = async (values: z.infer<typeof createCategoryDto>) => {
    if (selectedCategory) {
      await dispatch(
        updateCategory({ id: selectedCategory.id, updateCategory: values }),
      );
      if (error) return toast.error(t.addCategory.messages.update.fail[lang]);
      toast.success(t.addCategory.messages.update.success[lang]);
      void navigate("/admin/categories", {
        state: { search: values.translations[lang] },
      });
      return clearSelectedCategory();
    }
    await dispatch(createCategory(values));
    if (error) return toast.error(t.addCategory.messages.create.fail[lang]);
    toast.success(t.addCategory.messages.create.success[lang]);
    void navigate("/admin/categories", {
      state: { search: values.translations[lang] },
    });
  };

  const onInvalidSubmit: SubmitErrorHandler<Category> = (errors) => {
    const firstErrorKey = getFirstErrorMessage(errors);

    if (firstErrorKey) {
      toast.error(firstErrorKey);
    } else {
      toast.error(t.addCategory.messages.general[lang]);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onValidSubmit, onInvalidSubmit)}
        className="flex flex-col gap-3 max-w-[500px]"
      >
        <h1 className="text-xl mb-4">
          {selectedCategory
            ? t.addCategory.headings.update[lang]
            : t.addCategory.headings.addNew[lang]}
        </h1>

        <div className="flex gap-4">
          <div>
            <FormField
              control={form.control}
              name="translations.en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.addCategory.form.nameEn[lang]}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div>
            <FormField
              control={form.control}
              name="translations.fi"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.addCategory.form.nameFi[lang]}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        <div>
          <FormField
            control={form.control}
            name="parent_id"
            render={({ field }) => (
              <FormItem>
                <Label>{t.addCategory.form.parentCategory[lang]}</Label>
                <Select
                  name="translations"
                  onValueChange={field.onChange}
                  defaultValue={form.getValues("parent_id") ?? ""}
                >
                  <FormControl>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue
                        placeholder={t.addCategory.placeholders.noParent[lang]}
                      ></SelectValue>
                    </SelectTrigger>
                  </FormControl>

                  <SelectContent>
                    {categories
                      ?.filter((cat) => cat.id !== selectedCategory?.id) // Remove the selected category from options
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id ?? ""}>
                          {cat.translations[lang]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          ></FormField>
        </div>

        <div className="*:w-fit px-8 self-end gap-3 flex">
          <Button variant="default" onClick={cancel} type="button">
            {t.addCategory.buttons.cancel[lang]}
          </Button>
          <Button variant="outline" type="submit">
            {t.addCategory.buttons.save[lang]}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default AddCategory;
