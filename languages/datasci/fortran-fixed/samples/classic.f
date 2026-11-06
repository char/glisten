C     A fixed-form example
      PROGRAM CLASSIC
      INTEGER I, TOTAL
      TOTAL = 0
      DO 10 I = 1, 5
      TOTAL = TOTAL + I
   10 CONTINUE
      PRINT *, TOTAL
      END
