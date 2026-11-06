MERGE INTO [dbo].[inventory] AS target
USING ##incoming AS source
ON target.id = source.id
WHEN MATCHED THEN
  UPDATE SET target.quantity = source.quantity
WHEN NOT MATCHED THEN
  INSERT (id, quantity) VALUES (source.id, source.quantity)
OUTPUT inserted.id, deleted.quantity, inserted.quantity;
GO
EXEC [dbo].[audit_inventory] @mode = N'full';
