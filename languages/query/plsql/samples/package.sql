CREATE OR REPLACE PACKAGE payroll AS
  PROCEDURE raise_salary(p_id employees.employee_id%TYPE, p_amount NUMBER);
END payroll;
/
CREATE OR REPLACE PACKAGE BODY payroll AS
  PROCEDURE raise_salary(p_id employees.employee_id%TYPE, p_amount NUMBER) IS
  BEGIN
    UPDATE employees SET salary = salary + p_amount WHERE employee_id = p_id;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN RAISE;
  END raise_salary;
END payroll;
/
