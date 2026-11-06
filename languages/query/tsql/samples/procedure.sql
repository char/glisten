CREATE OR ALTER PROCEDURE [dbo].[update_salary]
  @employee_id int,
  @amount decimal(10, 2)
AS
BEGIN
  SET NOCOUNT ON;
  BEGIN TRY
    UPDATE [dbo].[Employee]
      SET salary = salary + @amount
      OUTPUT inserted.employee_id, deleted.salary, inserted.salary
      WHERE employee_id = @employee_id;
  END TRY
  BEGIN CATCH
    THROW;
  END CATCH;
END;
GO
