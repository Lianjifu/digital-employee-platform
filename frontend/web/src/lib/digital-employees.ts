/** Shared department order and catalog sorting for digital employees. */

export const DIGITAL_EMPLOYEE_DEPARTMENT_ORDER: string[] = [
  '研发部',
  '销售部',
  '市场部',
  '运营部',
  '人事部',
  '财务部',
  '信息技术部',
];

type SortableEmployee = {
  id: string;
  name: string;
  role?: string;
  department: string;
};

/** 主标题：岗位名称（无岗位时回退花名）。 */
export function employeePrimaryLabel(employee: Pick<SortableEmployee, 'name' | 'role'>) {
  return employee.role?.trim() || employee.name;
}

/** 副行：部门 · 花名。 */
export function employeeSecondaryLabel(employee: Pick<SortableEmployee, 'name' | 'department'>) {
  return `${employee.department} · ${employee.name}`;
}

/** Department head / lead digital employee (one per department). */
export function isDepartmentHead(employee: SortableEmployee) {
  if (/-(manager|head)$/.test(employee.id)) return true;
  // 花名不含职称；仅以岗位名称判断负责人
  if (employee.role && /部负责人$|部经理$|负责人$|经理$|总监$|主管$/.test(employee.role)) return true;
  return false;
}

function departmentRank(department: string) {
  const index = DIGITAL_EMPLOYEE_DEPARTMENT_ORDER.indexOf(department);
  return index === -1 ? DIGITAL_EMPLOYEE_DEPARTMENT_ORDER.length : index;
}

/** Heads first globally, then department order, then name. */
export function compareDigitalEmployees(left: SortableEmployee, right: SortableEmployee) {
  const headCompare = Number(isDepartmentHead(right)) - Number(isDepartmentHead(left));
  if (headCompare !== 0) return headCompare;
  const departmentCompare = departmentRank(left.department) - departmentRank(right.department);
  if (departmentCompare !== 0) return departmentCompare;
  if (left.department !== right.department) return left.department.localeCompare(right.department, 'zh-CN');
  return left.name.localeCompare(right.name, 'zh-CN');
}

export function sortDigitalEmployees<T extends SortableEmployee>(employees: T[]) {
  return [...employees].sort(compareDigitalEmployees);
}
