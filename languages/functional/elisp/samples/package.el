;;; signal-report.el --- Count and report values -*- lexical-binding: t; -*-

(defgroup signal-report nil "A tiny example." :group 'tools)
(defcustom signal-report-prefix "Total" "Text used in reports." :type 'string)

;;;###autoload
(defun signal-report (values)
  "Display the sum of VALUES in the echo area."
  (interactive)
  (let ((total 0))
    (dolist (value values)
      (setq total (+ total value)))
    (message "%s: %d" signal-report-prefix total)))

(provide 'signal-report)
;;; signal-report.el ends here
