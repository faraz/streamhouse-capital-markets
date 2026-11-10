# The Confluent stack is on-demand, not always-on

The stack is brought up with `terraform apply` for rehearsals and the talk, and destroyed
after. Always-on was the original intent and was reversed once the meters were understood.

Flink statements bill per minute for as long as they run, and the normalization and
aggregation statements would run permanently. Lightning Tables bill CCUs even with nobody
querying, because a running producer alone drives the meter. Tableflow bills per topic-hour.
An always-on footprint is plausibly $300 to $700 a month, against a $400 trial credit that
expires thirty days from 9 November 2026. Left running, the credit would be gone before
the talk.

This is only tolerable because of the simulator (ADR-0002): the screen stays permanently
viewable with no Confluent spend at all, so nothing is lost by having the real stack down
between rehearsals.

## Consequences

`terraform destroy` is built and exercised from the first ticket rather than added at the
end, because an untested teardown is how people discover surprise bills. A lighter lever
exists for same-day rehearsals: pause the Flink statements and the Datagen connectors,
which are the two largest meters, without destroying the environment.

## Amended 2026-11-10: up from now until the talk

With two days to go, the stack stays up through Thursday rather than coming down between
rehearsals. A rebuild is the slow way to start over: `client_exposure` replays every position
and serves partial totals for about four minutes, and the demo has to be right whenever the
screen is opened. Starting over is the screen's Reset instead, which offsets the presenter's
fills on the live stack and lands at the next commit.

Eleven statements at the unconfirmed $0.21 per CFU-hour are about $55 a day, plus the
Lightning Tables, inside the credit. A rebuild is now for a broken stack only, and
`regenerate.sh` does not finish until the book is right. The pause lever above is untested
since `client_exposure` became a materialized table: resuming one is REST or Terraform
only, so do not pause it before the talk without trying the resume first.
