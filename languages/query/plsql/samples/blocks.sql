SET SERVEROUTPUT ON
DECLARE
  CURSOR active_employees IS SELECT employee_id FROM employees WHERE active = 1;
  v_id employees.employee_id%TYPE;
  PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
  <<employee_loop>>
  FOR employee IN active_employees LOOP
    v_id := employee.employee_id;
    INSERT INTO audit_log VALUES (:session_id, v_id);
  END LOOP employee_loop;
  COMMIT;
EXCEPTION
  WHEN OTHERS THEN RAISE;
END;
/
SPOOL output.log
@next_script.sql
