import Spinner from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { PaginatedDataTable } from "@/components/ui/data-table-paginated";
import { useLanguage } from "@/context/LanguageContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  deleteCategory,
  fetchAllCategories,
  selectCategories,
  selectCategoriesError,
  selectCategoriesLoading,
  selectCategoriesPagination,
  setSelectedCategory,
} from "@/store/slices/categoriesSlice";
import { Category } from "@common/items/categories";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { t } from "@/translations";

function Categories() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const categories = useAppSelector(selectCategories);
  const loading = useAppSelector(selectCategoriesLoading);
  const error = useAppSelector(selectCategoriesError);
  const { totalPages } = useAppSelector(selectCategoriesPagination);

  // Local state
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const [currentPage, setCurrentPage] = useState(1);
  const [order, setOrder] = useState("");
  const [ascending, setAscending] = useState<boolean | null>(null);

  const handleAscending = (ascending: boolean | null) =>
    setAscending(ascending);
  const handleSortOrder = (order: string) => setOrder(order.toLowerCase());

  const handlePageChange = (newPage: number) => setCurrentPage(newPage);

  const handleDelete = async (id: string) => {
    await dispatch(deleteCategory(id));
    if (error) {
      return toast.error(t.categories.messages.delete.fail[lang]);
    }
    toast.success(t.categories.messages.delete.success[lang]);
    void dispatch(
      fetchAllCategories({
        page: currentPage,
        limit: 10,
        search: debouncedSearchTerm,
        order,
        ascending: ascending ? "asc" : "desc",
      }),
    );
  };

  useEffect(() => {
    void dispatch(
      fetchAllCategories({
        page: currentPage,
        limit: 10,
        search: debouncedSearchTerm,
        order,
        ascending: ascending ? "asc" : "desc",
      }),
    );
  }, [currentPage, dispatch, debouncedSearchTerm, order, ascending]);

  const categoryColumns: ColumnDef<Category>[] = [
    {
      id: "name",
      header: t.categories.table.name[lang],
      cell: ({ row }) => {
        const name = row.original.translations[lang];
        return name;
      },
    },
    {
      id: "assigned_to",
      header: t.categories.table.assignedTo[lang],
      cell: ({ row }) => {
        const count = row.original.assigned_to;
        return `${count} items`;
      },
    },
    {
      id: "actions",
      header: () => (
        <div className="w-full flex justify-end pr-4">
          <span>{t.categories.table.actions[lang]}</span>
        </div>
      ),
      cell: ({ row }) => {
        const { id } = row.original;
        return (
          <div className="text-right">
            <Button
              variant="destructive"
              className="w-fit p-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleDelete(id);
              }}
            >
              <Trash />
            </Button>
          </div>
        );
      },
    },
  ];

  if (loading) return <Spinner />;

  return (
    <>
      <div className="flex justify-between">
        <h1 className="text-xl mb-4">
          {t.categories.headings.manageCategories[lang]}
        </h1>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => navigate("/admin/categories/new")}
        >
          <Plus />
          {t.categories.buttons.addNew[lang]}
        </Button>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4 items-center">
          <input
            type="text"
            size={50}
            className="w-full sm:max-w-sm text-sm p-2 bg-white rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--secondary)] focus:border-[var(--secondary)]"
            placeholder={t.categories.placeholders.search[lang]} // translate placeholder
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <PaginatedDataTable
        columns={categoryColumns}
        data={categories}
        pageIndex={currentPage - 1}
        pageCount={totalPages}
        handleAscending={handleAscending}
        handleOrder={handleSortOrder}
        order={order}
        ascending={ascending}
        onPageChange={(page) => handlePageChange(page + 1)}
        rowProps={(row) => ({
          style: { cursor: "pointer" },
          onClick: () => {
            void dispatch(setSelectedCategory(row.original));
            void navigate(`/admin/categories/${row.original.id}`);
          },
        })}
      />
    </>
  );
}

export default Categories;
