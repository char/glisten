DECLARE
  square_text VARCHAR2(200) := q'[This isn't the end ] until here]';
  brace_text VARCHAR2(200) := Q'{A } isn't the closing delimiter}';
  angle_text VARCHAR2(200) := q'<One > two>';
  round_text VARCHAR2(200) := q'(a ) b)';
  same_text VARCHAR2(200) := q'!No escaping ' here!';
  closing_text VARCHAR2(200) := q']A ] doesn't close until an apostrophe]';
BEGIN
  dbms_output.put_line(square_text || same_text);
END;
/
