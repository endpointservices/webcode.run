
import {Logging} from '@google-cloud/logging';
const logging = new Logging({projectId: "endpointservice"});

export class Logger {
    constructor() {
        this.backlog = [];
    }

    initialize(labels) {
        this.labels = labels;

        // Use a dedicated namespace log
        this.cloudlog = logging.log(labels.namespace);
        // clear backlog
        this.backlog.forEach(msg => this.log(msg))
        this.backlog = undefined;
    }

    log(msg) {
        if (this.cloudlog === undefined) {
            this.backlog.push(msg);
        } else {
            const entry = this.cloudlog.entry({
                resource: {
                    type: 'generic_task',
                    labels: this.labels,
                }
            }, msg);
            return this.cloudlog.write(entry);
        }
    }
}