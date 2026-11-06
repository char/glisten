;;;; A small report generator.
(defpackage :report (:use :cl) (:export :summarize))
(in-package :report)

(defun summarize (numbers &key (scale 1.0d0))
  (let ((total (loop for n in numbers sum n)))
    (when numbers
      (format nil "Total: ~,2f" (* total scale)))))

(defmethod describe-object ((value report) stream)
  (print-unreadable-object (value stream :type t)
    (write-string (report-name value) stream)))
